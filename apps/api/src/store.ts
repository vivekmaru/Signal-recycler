import { DatabaseSync } from "node:sqlite";
import {
  type EventCategory,
  type PlaybookRule,
  type SessionRecord,
  type TimelineEvent
} from "@signal-recycler/shared";

type CreateRuleInput = {
  projectId: string;
  category: string;
  rule: string;
  reason: string;
  sourceEventId?: string | null;
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
  `);

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

    createRuleCandidate(input: CreateRuleInput): PlaybookRule {
      const rule: PlaybookRule = {
        id: createId("rule"),
        projectId: input.projectId,
        status: "pending",
        category: input.category,
        rule: input.rule,
        reason: input.reason,
        sourceEventId: input.sourceEventId ?? null,
        createdAt: now(),
        approvedAt: null
      };
      db.prepare(
        "INSERT INTO rules (id, project_id, status, category, rule, reason, source_event_id, created_at, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        rule.id,
        rule.projectId,
        rule.status,
        rule.category,
        rule.rule,
        rule.reason,
        rule.sourceEventId,
        rule.createdAt,
        rule.approvedAt
      );
      return rule;
    },

    approveRule(id: string): PlaybookRule {
      const approvedAt = now();
      db.prepare("UPDATE rules SET status = 'approved', approved_at = ? WHERE id = ?").run(
        approvedAt,
        id
      );
      const rule = this.getRule(id);
      if (!rule) throw new Error(`Rule not found: ${id}`);
      return rule;
    },

    rejectRule(id: string): PlaybookRule {
      db.prepare("UPDATE rules SET status = 'rejected', approved_at = NULL WHERE id = ?").run(
        id
      );
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
    }
  };
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
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    status: row.status as PlaybookRule["status"],
    category: String(row.category),
    rule: String(row.rule),
    reason: String(row.reason),
    sourceEventId: row.source_event_id === null ? null : String(row.source_event_id),
    createdAt: String(row.created_at),
    approvedAt: row.approved_at === null ? null : String(row.approved_at)
  };
}
