import { DatabaseSync } from "node:sqlite";
import {
  type EventCategory,
  type MemoryConfidence,
  type MemoryScope,
  type MemorySource,
  type MemorySyncStatus,
  type MemoryType,
  type PlaybookRule,
  type SessionRecord,
  type TimelineEvent,
  memoryConfidenceSchema,
  memorySyncStatusSchema,
  memoryScopeSchema,
  memorySourceSchema,
  memoryTypeSchema,
  ruleStatusSchema
} from "@signal-recycler/shared";

type CreateRuleInput = {
  projectId: string;
  category: string;
  rule: string;
  reason: string;
  sourceEventId?: string | null;
  memoryType?: MemoryType;
  scope?: MemoryScope;
  source?: MemorySource;
  confidence?: MemoryConfidence;
  syncStatus?: MemorySyncStatus;
};

type CreateSessionInput = {
  projectId: string;
  title: string;
};

type CreateEventInput = {
  sessionId: string;
  category: EventCategory;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
};

export type SignalRecyclerStore = ReturnType<typeof createStore>;

export function createStore(path: string) {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      metadata TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rules (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      status TEXT NOT NULL,
      category TEXT NOT NULL,
      rule TEXT NOT NULL,
      reason TEXT NOT NULL,
      source_event_id TEXT,
      created_at TEXT NOT NULL,
      approved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    INSERT OR IGNORE INTO schema_meta (key, value) VALUES ('schema_version', '1');

    CREATE INDEX IF NOT EXISTS idx_sessions_project_created
      ON sessions (project_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_events_session_created
      ON events (session_id, created_at ASC);

    CREATE INDEX IF NOT EXISTS idx_rules_project_status_created
      ON rules (project_id, status, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_rules_project_status_approved
      ON rules (project_id, status, approved_at ASC);
  `);

  migrateSchema(db);

  return {
    createSession(input: CreateSessionInput): SessionRecord {
      const session: SessionRecord = {
        id: createId("session"),
        projectId: input.projectId,
        title: input.title,
        createdAt: now()
      };
      db.prepare(
        "INSERT INTO sessions (id, project_id, title, created_at) VALUES (?, ?, ?, ?)"
      ).run(session.id, session.projectId, session.title, session.createdAt);
      return session;
    },

    listSessions(): SessionRecord[] {
      return db
        .prepare("SELECT * FROM sessions ORDER BY created_at DESC")
        .all()
        .map(mapSession);
    },

    getSession(id: string): SessionRecord | null {
      const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id);
      return row ? mapSession(row) : null;
    },

    createEvent(input: CreateEventInput): TimelineEvent {
      const event: TimelineEvent = {
        id: createId("event"),
        sessionId: input.sessionId,
        category: input.category,
        title: input.title,
        body: input.body,
        metadata: input.metadata ?? {},
        createdAt: now()
      };
      db.prepare(
        "INSERT INTO events (id, session_id, category, title, body, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(
        event.id,
        event.sessionId,
        event.category,
        event.title,
        event.body,
        JSON.stringify(event.metadata),
        event.createdAt
      );
      return event;
    },

    listEvents(sessionId: string): TimelineEvent[] {
      return db
        .prepare("SELECT * FROM events WHERE session_id = ? ORDER BY created_at ASC")
        .all(sessionId)
        .map(mapEvent);
    },

    listAllEvents(limit = 100): TimelineEvent[] {
      return db
        .prepare("SELECT * FROM events ORDER BY created_at DESC LIMIT ?")
        .all(limit)
        .map(mapEvent);
    },

    createRuleCandidate(input: CreateRuleInput): PlaybookRule {
      const timestamp = now();
      const rule: PlaybookRule = {
        id: createId("rule"),
        projectId: input.projectId,
        status: "pending",
        category: input.category,
        rule: input.rule,
        reason: input.reason,
        sourceEventId: input.sourceEventId ?? null,
        createdAt: timestamp,
        approvedAt: null,
        memoryType: input.memoryType ?? "rule",
        scope: input.scope ?? { type: "project", value: null },
        source: input.source ?? defaultMemorySource(input.sourceEventId ?? null),
        confidence: input.confidence ?? "medium",
        lastUsedAt: null,
        supersededBy: null,
        syncStatus: input.syncStatus ?? "local",
        updatedAt: timestamp
      };
      db.prepare(
        `INSERT INTO rules (
          id, project_id, status, category, rule, reason, source_event_id, created_at, approved_at,
          memory_type, scope, source, confidence, last_used_at, superseded_by, sync_status, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        rule.id,
        rule.projectId,
        rule.status,
        rule.category,
        rule.rule,
        rule.reason,
        rule.sourceEventId,
        rule.createdAt,
        rule.approvedAt,
        rule.memoryType,
        JSON.stringify(rule.scope),
        JSON.stringify(rule.source),
        rule.confidence,
        rule.lastUsedAt,
        rule.supersededBy,
        rule.syncStatus,
        rule.updatedAt
      );
      return rule;
    },

    approveRule(id: string): PlaybookRule {
      const approvedAt = now();
      db.prepare(
        "UPDATE rules SET status = 'approved', approved_at = ?, updated_at = ? WHERE id = ?"
      ).run(approvedAt, approvedAt, id);
      const rule = this.getRule(id);
      if (!rule) throw new Error(`Rule not found: ${id}`);
      return rule;
    },

    rejectRule(id: string): PlaybookRule {
      const updatedAt = now();
      db.prepare(
        "UPDATE rules SET status = 'rejected', approved_at = NULL, updated_at = ? WHERE id = ?"
      ).run(updatedAt, id);
      const rule = this.getRule(id);
      if (!rule) throw new Error(`Rule not found: ${id}`);
      return rule;
    },

    getRule(id: string): PlaybookRule | null {
      const row = db.prepare("SELECT * FROM rules WHERE id = ?").get(id);
      return row ? mapRule(row) : null;
    },

    listRules(projectId: string): PlaybookRule[] {
      return db
        .prepare("SELECT * FROM rules WHERE project_id = ? ORDER BY created_at DESC")
        .all(projectId)
        .map(mapRule);
    },

    listApprovedRules(projectId: string): PlaybookRule[] {
      return dedupeRules(
        db
        .prepare(
          "SELECT * FROM rules WHERE project_id = ? AND status = 'approved' ORDER BY approved_at ASC"
        )
        .all(projectId)
          .map(mapRule)
      );
    },

    clearProjectMemory(projectId: string): { rulesDeleted: number; eventsDeleted: number; sessionsDeleted: number } {
      const rulesResult = db
        .prepare("DELETE FROM rules WHERE project_id = ?")
        .run(projectId);
      // Delete events and sessions tied to this project's sessions
      const sessionRows = db
        .prepare("SELECT id FROM sessions WHERE project_id = ?")
        .all(projectId) as Array<{ id: string }>;
      let eventsDeleted = 0;
      for (const row of sessionRows) {
        const r = db.prepare("DELETE FROM events WHERE session_id = ?").run(row.id);
        eventsDeleted += Number(r.changes);
      }
      const proxyEvents = db
        .prepare(
          "DELETE FROM events WHERE session_id = 'proxy' AND json_extract(metadata, '$.projectId') = ?"
        )
        .run(projectId);
      eventsDeleted += Number(proxyEvents.changes);
      const sessionsResult = db
        .prepare("DELETE FROM sessions WHERE project_id = ?")
        .run(projectId);
      return {
        rulesDeleted: Number(rulesResult.changes),
        eventsDeleted,
        sessionsDeleted: Number(sessionsResult.changes)
      };
    },

    exportPlaybook(projectId: string): string {
      const rules = this.listApprovedRules(projectId);
      const lines = [
        "# Signal Recycler Playbook",
        "",
        "Approved project rules learned from prior Codex sessions.",
        ""
      ];
      if (rules.length === 0) {
        lines.push("_No approved rules yet._");
      } else {
        for (const rule of rules) {
          lines.push(`- **${rule.category}:** ${rule.rule}`);
          lines.push(`  - Reason: ${rule.reason}`);
        }
      }
      return lines.join("\n");
    },

    inspectSchema(): { schemaVersion: number; indexes: string[] } {
      const versionRow = db
        .prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'")
        .get() as { value?: string } | undefined;
      const indexes = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%' ORDER BY name ASC"
        )
        .all()
        .map((row) => String((row as { name: unknown }).name));

      return {
        schemaVersion: Number(versionRow?.value ?? 0),
        indexes
      };
    }
  };
}

function migrateSchema(db: DatabaseSync): void {
  const versionRow = db
    .prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'")
    .get() as { value?: string } | undefined;
  const version = Number(versionRow?.value ?? 1);

  if (version < 2 || hasMissingRuleMemoryColumns(db)) {
    db.exec("BEGIN");
    try {
      addRuleColumnIfMissing(db, "memory_type", "TEXT NOT NULL DEFAULT 'rule'");
      addRuleColumnIfMissing(
        db,
        "scope",
        `TEXT NOT NULL DEFAULT '{"type":"project","value":null}'`
      );
      addRuleColumnIfMissing(
        db,
        "source",
        `TEXT NOT NULL DEFAULT '{"kind":"manual","author":"local-user"}'`
      );
      addRuleColumnIfMissing(db, "confidence", "TEXT NOT NULL DEFAULT 'medium'");
      addRuleColumnIfMissing(db, "last_used_at", "TEXT");
      addRuleColumnIfMissing(db, "superseded_by", "TEXT");
      addRuleColumnIfMissing(db, "sync_status", "TEXT NOT NULL DEFAULT 'local'");
      addRuleColumnIfMissing(db, "updated_at", "TEXT");
      db.prepare("UPDATE rules SET updated_at = created_at WHERE updated_at IS NULL").run();
      db.prepare("UPDATE schema_meta SET value = '2' WHERE key = 'schema_version'").run();
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_usages (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      memory_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      adapter TEXT NOT NULL,
      reason TEXT NOT NULL,
      injected_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_memory_usages_memory_injected
      ON memory_usages (memory_id, injected_at DESC);

    CREATE INDEX IF NOT EXISTS idx_memory_usages_project_injected
      ON memory_usages (project_id, injected_at DESC);
  `);
}

function hasMissingRuleMemoryColumns(db: DatabaseSync): boolean {
  const columns = getRuleColumns(db);
  return [
    "memory_type",
    "scope",
    "source",
    "confidence",
    "last_used_at",
    "superseded_by",
    "sync_status",
    "updated_at"
  ].some((column) => !columns.has(column));
}

function addRuleColumnIfMissing(
  db: DatabaseSync,
  column: string,
  definition: string
): void {
  const columns = getRuleColumns(db);
  if (columns.has(column)) return;
  db.exec(`ALTER TABLE rules ADD COLUMN ${column} ${definition}`);
}

function getRuleColumns(db: DatabaseSync): Set<string> {
  return new Set(
    db
      .prepare("PRAGMA table_info(rules)")
      .all()
      .map((row) => String((row as { name: unknown }).name))
  );
}

function dedupeRules(rules: PlaybookRule[]): PlaybookRule[] {
  const seen = new Set<string>();
  return rules.filter((rule) => {
    const key = `${rule.category}:${rule.rule}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function now(): string {
  return new Date().toISOString();
}

function defaultMemorySource(sourceEventId: string | null): MemorySource {
  if (sourceEventId) {
    return { kind: "event", sessionId: "unknown", eventId: sourceEventId };
  }
  return { kind: "manual", author: "local-user" };
}

function parseJsonColumn<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function mapSession(row: Record<string, unknown>): SessionRecord {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    title: String(row.title),
    createdAt: String(row.created_at)
  };
}

function mapEvent(row: Record<string, unknown>): TimelineEvent {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    category: row.category as EventCategory,
    title: String(row.title),
    body: String(row.body),
    metadata: JSON.parse(String(row.metadata)) as Record<string, unknown>,
    createdAt: String(row.created_at)
  };
}

function mapRule(row: Record<string, unknown>): PlaybookRule {
  const scope = memoryScopeSchema.parse(
    parseJsonColumn(row.scope, { type: "project", value: null })
  );
  const source = memorySourceSchema.parse(
    parseJsonColumn(row.source, { kind: "manual", author: "local-user" })
  );

  return {
    id: String(row.id),
    projectId: String(row.project_id),
    status: ruleStatusSchema.parse(row.status),
    category: String(row.category),
    rule: String(row.rule),
    reason: String(row.reason),
    sourceEventId: row.source_event_id === null ? null : String(row.source_event_id),
    createdAt: String(row.created_at),
    approvedAt: row.approved_at === null ? null : String(row.approved_at),
    memoryType: memoryTypeSchema.parse(row.memory_type ?? "rule"),
    scope,
    source,
    confidence: memoryConfidenceSchema.parse(row.confidence ?? "medium"),
    lastUsedAt:
      row.last_used_at === null || row.last_used_at === undefined
        ? null
        : String(row.last_used_at),
    supersededBy:
      row.superseded_by === null || row.superseded_by === undefined
        ? null
        : String(row.superseded_by),
    syncStatus: memorySyncStatusSchema.parse(row.sync_status ?? "local"),
    updatedAt: String(row.updated_at ?? row.created_at)
  };
}
