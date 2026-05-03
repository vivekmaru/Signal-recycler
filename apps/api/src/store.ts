import { DatabaseSync } from "node:sqlite";
import {
  type EventCategory,
  type MemoryConfidence,
  type MemoryUsage,
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

type RecordMemoryUsageInput = {
  projectId: string;
  memoryId: string;
  sessionId: string;
  eventId: string;
  adapter: string;
  reason: string;
};

type RecordMemoryInjectionEventInput = {
  sessionId: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  usages: Array<Omit<RecordMemoryUsageInput, "eventId">>;
};

type SearchApprovedMemoriesInput = {
  projectId: string;
  query: string;
  limit: number;
};

type SearchApprovedMemoriesResult = {
  memory: PlaybookRule;
  rank: number;
  score: number;
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

    listSessions(projectId?: string): SessionRecord[] {
      if (projectId !== undefined) {
        return db
          .prepare("SELECT * FROM sessions WHERE project_id = ? ORDER BY created_at DESC")
          .all(projectId)
          .map(mapSession);
      }
      return db.prepare("SELECT * FROM sessions ORDER BY created_at DESC").all().map(mapSession);
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

    listAllEventsForProject(projectId: string, limit = 100): TimelineEvent[] {
      return db
        .prepare(
          `SELECT events.*
           FROM events
           LEFT JOIN sessions ON sessions.id = events.session_id
           WHERE sessions.project_id = ?
              OR (sessions.id IS NULL AND json_extract(events.metadata, '$.projectId') = ?)
           ORDER BY events.created_at DESC
           LIMIT ?`
        )
        .all(projectId, projectId, limit)
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
        source: input.source ?? defaultMemorySource(db, input.sourceEventId ?? null),
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
      syncMemoryFts(db, rule);
      return rule;
    },

    approveRule(id: string): PlaybookRule {
      const approvedAt = now();
      db.prepare(
        "UPDATE rules SET status = 'approved', approved_at = ?, updated_at = ? WHERE id = ?"
      ).run(approvedAt, approvedAt, id);
      const rule = this.getRule(id);
      if (!rule) throw new Error(`Rule not found: ${id}`);
      syncMemoryFts(db, rule);
      return rule;
    },

    rejectRule(id: string): PlaybookRule {
      const updatedAt = now();
      db.prepare(
        "UPDATE rules SET status = 'rejected', approved_at = NULL, updated_at = ? WHERE id = ?"
      ).run(updatedAt, id);
      const rule = this.getRule(id);
      if (!rule) throw new Error(`Rule not found: ${id}`);
      syncMemoryFts(db, rule);
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
          "SELECT * FROM rules WHERE project_id = ? AND status = 'approved' AND superseded_by IS NULL ORDER BY approved_at ASC"
        )
        .all(projectId)
          .map(mapRule)
      );
    },

    searchApprovedMemories(input: SearchApprovedMemoriesInput): SearchApprovedMemoriesResult[] {
      const terms = tokenizeSearchQuery(input.query);
      if (terms.length === 0 || input.limit <= 0) return [];
      const matchQuery = terms.map((term) => `"${term}"`).join(" OR ");
      const rows = db
        .prepare(
          `SELECT rules.*, bm25(memory_fts, 0.0, 0.0, 6.0, 4.0, 2.0, 1.0) AS search_score
           FROM memory_fts
           JOIN rules ON rules.id = memory_fts.memory_id
           WHERE memory_fts MATCH ?
             AND memory_fts.project_id = ?
             AND rules.project_id = ?
             AND rules.status = 'approved'
             AND rules.superseded_by IS NULL
             AND NOT EXISTS (
               SELECT 1
               FROM rules AS earlier
               WHERE earlier.project_id = rules.project_id
                 AND earlier.status = 'approved'
                 AND earlier.superseded_by IS NULL
                 AND earlier.category = rules.category
                 AND earlier.rule = rules.rule
                 AND (
                   earlier.approved_at < rules.approved_at
                   OR (
                     earlier.approved_at = rules.approved_at
                     AND earlier.rowid < rules.rowid
                   )
                 )
             )
           ORDER BY search_score ASC, approved_at ASC, id ASC
           LIMIT ?`
        )
        .all(matchQuery, input.projectId, input.projectId, input.limit) as Array<
        Record<string, unknown> & { search_score: number }
      >;

      return rows.map((row, index) => ({
        memory: mapRule(row),
        rank: index + 1,
        score: Math.max(0, -Number(row.search_score))
      }));
    },

    recordMemoryUsage(input: RecordMemoryUsageInput): MemoryUsage {
      const memoryRow = db
        .prepare("SELECT * FROM rules WHERE id = ? AND project_id = ?")
        .get(input.memoryId, input.projectId);
      if (!memoryRow) throw new Error(`Rule not found for project: ${input.memoryId}`);
      const memory = mapRule(memoryRow);
      if (memory.status !== "approved" || memory.supersededBy !== null) {
        throw new Error(`Rule is not injectable: ${input.memoryId}`);
      }

      const injectedAt = now();
      const usage: MemoryUsage = {
        id: createId("usage"),
        projectId: input.projectId,
        memoryId: input.memoryId,
        sessionId: input.sessionId,
        eventId: input.eventId,
        adapter: input.adapter,
        reason: input.reason,
        injectedAt
      };

      db.exec("BEGIN");
      try {
        db.prepare(
          `INSERT INTO memory_usages (
            id, project_id, memory_id, session_id, event_id, adapter, reason, injected_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          usage.id,
          usage.projectId,
          usage.memoryId,
          usage.sessionId,
          usage.eventId,
          usage.adapter,
          usage.reason,
          usage.injectedAt
        );
        const result = db
          .prepare(
            `UPDATE rules
             SET last_used_at = ?, updated_at = ?
             WHERE id = ? AND project_id = ? AND status = 'approved' AND superseded_by IS NULL`
          )
          .run(usage.injectedAt, usage.injectedAt, usage.memoryId, usage.projectId);
        if (result.changes !== 1) throw new Error(`Rule is not injectable: ${usage.memoryId}`);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }

      return usage;
    },

    recordMemoryInjectionEvent(input: RecordMemoryInjectionEventInput): TimelineEvent {
      if (input.usages.length === 0) throw new Error("Memory injection requires usages");
      for (const usage of input.usages) {
        const memoryRow = db
          .prepare(
            "SELECT * FROM rules WHERE id = ? AND project_id = ? AND status = 'approved' AND superseded_by IS NULL"
          )
          .get(usage.memoryId, usage.projectId);
        if (!memoryRow) throw new Error(`Rule is not injectable: ${usage.memoryId}`);
      }

      const timestamp = now();
      const event: TimelineEvent = {
        id: createId("event"),
        sessionId: input.sessionId,
        category: "memory_injection",
        title: input.title,
        body: input.body,
        metadata: input.metadata,
        createdAt: timestamp
      };

      db.exec("BEGIN");
      try {
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

        for (const usageInput of input.usages) {
          const usageId = createId("usage");
          db.prepare(
            `INSERT INTO memory_usages (
              id, project_id, memory_id, session_id, event_id, adapter, reason, injected_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            usageId,
            usageInput.projectId,
            usageInput.memoryId,
            usageInput.sessionId,
            event.id,
            usageInput.adapter,
            usageInput.reason,
            timestamp
          );
          const result = db
            .prepare(
              `UPDATE rules
               SET last_used_at = ?, updated_at = ?
               WHERE id = ? AND project_id = ? AND status = 'approved' AND superseded_by IS NULL`
            )
            .run(timestamp, timestamp, usageInput.memoryId, usageInput.projectId);
          if (result.changes !== 1) throw new Error(`Rule is not injectable: ${usageInput.memoryId}`);
        }

        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }

      return event;
    },

    listMemoryUsages(memoryId: string): MemoryUsage[] {
      return db
        .prepare(
          "SELECT * FROM memory_usages WHERE memory_id = ? ORDER BY injected_at DESC, id DESC"
        )
        .all(memoryId)
        .map(mapMemoryUsage);
    },

    listMemoryUsagesForProject(projectId: string, memoryId: string): MemoryUsage[] {
      return db
        .prepare(
          "SELECT * FROM memory_usages WHERE project_id = ? AND memory_id = ? ORDER BY injected_at DESC, id DESC"
        )
        .all(projectId, memoryId)
        .map(mapMemoryUsage);
    },

    supersedeRule(id: string, replacementId: string): PlaybookRule {
      if (id === replacementId) throw new Error(`Rule cannot supersede itself: ${id}`);
      const original = this.getRule(id);
      if (!original) throw new Error(`Rule not found: ${id}`);
      const replacement = this.getRule(replacementId);
      if (!replacement) throw new Error(`Replacement rule not found: ${replacementId}`);
      if (replacement.projectId !== original.projectId) {
        throw new Error(`Replacement rule not found in project: ${replacementId}`);
      }
      if (replacement.status !== "approved") {
        throw new Error(`Replacement rule is not approved: ${replacementId}`);
      }

      const updatedAt = now();
      const result = db
        .prepare(
          "UPDATE rules SET superseded_by = ?, updated_at = ? WHERE id = ? AND project_id = ?"
        )
        .run(replacementId, updatedAt, id, original.projectId);
      if (result.changes !== 1) throw new Error(`Rule not found: ${id}`);
      const rule = this.getRule(id);
      if (!rule) throw new Error(`Rule not found: ${id}`);
      syncMemoryFts(db, rule);
      return rule;
    },

    clearProjectMemory(projectId: string): {
      rulesDeleted: number;
      eventsDeleted: number;
      sessionsDeleted: number;
      memoryUsagesDeleted: number;
    } {
      const usagesResult = db.prepare("DELETE FROM memory_usages WHERE project_id = ?").run(projectId);
      db.prepare("DELETE FROM memory_fts WHERE project_id = ?").run(projectId);
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
        sessionsDeleted: Number(sessionsResult.changes),
        memoryUsagesDeleted: Number(usagesResult.changes)
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

    inspectSchema(): { schemaVersion: number; indexes: string[]; tables: string[] } {
      const versionRow = db
        .prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'")
        .get() as { value?: string } | undefined;
      const indexes = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%' ORDER BY name ASC"
        )
        .all()
        .map((row) => String((row as { name: unknown }).name));
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name ASC"
        )
        .all()
        .map((row) => String((row as { name: unknown }).name));

      return {
        schemaVersion: Number(versionRow?.value ?? 0),
        indexes,
        tables
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
      backfillEventMemorySources(db);
      db.prepare("UPDATE schema_meta SET value = '2' WHERE key = 'schema_version'").run();
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  backfillEventMemorySources(db);

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

  if (version < 3 || !hasMemoryFtsTable(db)) {
    ensureMemoryFtsTable(db);
    rebuildMemoryFts(db);
    db.prepare("UPDATE schema_meta SET value = '3' WHERE key = 'schema_version'").run();
  }
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

function backfillEventMemorySources(db: DatabaseSync): void {
  const columns = getRuleColumns(db);
  if (!columns.has("source") || !columns.has("source_event_id")) return;
  db.prepare(
    `UPDATE rules
     SET source = json_object(
       'kind', 'event',
       'sessionId', COALESCE(
         (SELECT events.session_id FROM events WHERE events.id = rules.source_event_id),
         'unknown'
       ),
       'eventId', source_event_id
     )
     WHERE source_event_id IS NOT NULL
       AND source = '{"kind":"manual","author":"local-user"}'`
  ).run();
}

function ensureMemoryFtsTable(db: DatabaseSync): void {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
      memory_id UNINDEXED,
      project_id UNINDEXED,
      category,
      rule,
      reason,
      source_text,
      tokenize = 'porter unicode61'
    );
  `);
}

function hasMemoryFtsTable(db: DatabaseSync): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'memory_fts'")
    .get();
  return row !== undefined;
}

function rebuildMemoryFts(db: DatabaseSync): void {
  db.prepare("DELETE FROM memory_fts").run();
  db.prepare(
    `INSERT INTO memory_fts (memory_id, project_id, category, rule, reason, source_text)
     SELECT rules.id, rules.project_id, rules.category, rules.rule, rules.reason, COALESCE(events.body, '')
     FROM rules
     LEFT JOIN events ON events.id = rules.source_event_id`
  ).run();
}

function syncMemoryFts(db: DatabaseSync, rule: PlaybookRule): void {
  db.prepare("DELETE FROM memory_fts WHERE memory_id = ?").run(rule.id);
  db.prepare(
    `INSERT INTO memory_fts (memory_id, project_id, category, rule, reason, source_text)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    rule.id,
    rule.projectId,
    rule.category,
    rule.rule,
    rule.reason,
    sourceTextForRule(db, rule.sourceEventId)
  );
}

function sourceTextForRule(db: DatabaseSync, sourceEventId: string | null): string {
  if (!sourceEventId) return "";
  const row = db
    .prepare("SELECT body FROM events WHERE id = ?")
    .get(sourceEventId) as { body?: string } | undefined;
  return String(row?.body ?? "");
}

const SEARCH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "to",
  "test",
  "testing",
  "tests",
  "with"
]);

function tokenizeSearchQuery(query: string): string[] {
  const seen = new Set<string>();
  const matches = query.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const terms: string[] = [];
  for (const match of matches) {
    if (SEARCH_STOP_WORDS.has(match)) continue;
    if (seen.has(match)) continue;
    seen.add(match);
    terms.push(match);
  }
  return terms;
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

function defaultMemorySource(db: DatabaseSync, sourceEventId: string | null): MemorySource {
  if (sourceEventId) {
    const row = db
      .prepare("SELECT session_id FROM events WHERE id = ?")
      .get(sourceEventId) as { session_id?: string } | undefined;
    return { kind: "event", sessionId: String(row?.session_id ?? "unknown"), eventId: sourceEventId };
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

function mapMemoryUsage(row: Record<string, unknown>): MemoryUsage {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    memoryId: String(row.memory_id),
    sessionId: String(row.session_id),
    eventId: String(row.event_id),
    adapter: String(row.adapter),
    reason: String(row.reason),
    injectedAt: String(row.injected_at)
  };
}
