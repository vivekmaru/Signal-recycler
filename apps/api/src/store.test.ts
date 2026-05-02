import { DatabaseSync } from "node:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStore } from "./store.js";

describe("store", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("approves a candidate rule and exports only approved rules", () => {
    const store = createStore(":memory:");
    const session = store.createSession({ projectId: "demo", title: "Demo session" });
    const candidate = store.createRuleCandidate({
      projectId: "demo",
      category: "tooling",
      rule: "Use pnpm for package operations.",
      reason: "The npm path failed in the first run.",
      sourceEventId: session.id
    });
    store.createRuleCandidate({
      projectId: "demo",
      category: "style",
      rule: "Keep UI copy terse.",
      reason: "Rejected candidate fixture.",
      sourceEventId: session.id
    });

    const approved = store.approveRule(candidate.id);
    const markdown = store.exportPlaybook("demo");

    expect(approved.status).toBe("approved");
    expect(markdown).toContain("Use pnpm for package operations.");
    expect(markdown).not.toContain("Keep UI copy terse.");
  });

  it("initializes schema metadata and query indexes", () => {
    const store = createStore(":memory:");
    const internals = store.inspectSchema();

    expect(internals.schemaVersion).toBe(3);
    expect(internals.tables).toEqual(expect.arrayContaining(["memory_fts"]));
    expect(internals.indexes).toEqual(
      expect.arrayContaining([
        "idx_sessions_project_created",
        "idx_events_session_created",
        "idx_rules_project_status_created",
        "idx_rules_project_status_approved",
        "idx_memory_usages_memory_injected",
        "idx_memory_usages_project_injected"
      ])
    );
  });

  it("treats empty project IDs as scoped when listing sessions", () => {
    const store = createStore(":memory:");
    const emptyProjectSession = store.createSession({ projectId: "", title: "Empty project" });
    store.createSession({ projectId: "demo", title: "Demo project" });

    expect(store.listSessions("").map((session) => session.id)).toEqual([emptyProjectSession.id]);
  });

  it("migrates rule rows into memory records with provenance defaults", () => {
    const store = createStore(":memory:");

    const candidate = store.createRuleCandidate({
      projectId: "demo",
      category: "package-manager",
      rule: "Use pnpm for package management.",
      reason: "The workspace is configured for pnpm.",
      sourceEventId: null
    });

    expect(store.inspectSchema().schemaVersion).toBe(3);
    expect(candidate.memoryType).toBe("rule");
    expect(candidate.scope).toEqual({ type: "project", value: null });
    expect(candidate.source).toEqual({ kind: "manual", author: "local-user" });
    expect(candidate.confidence).toBe("medium");
    expect(candidate.lastUsedAt).toBeNull();
    expect(candidate.supersededBy).toBeNull();
    expect(candidate.syncStatus).toBe("local");
    expect(candidate.updatedAt).toBe(candidate.createdAt);
  });

  it("updates rule updatedAt when approving and rejecting", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const store = createStore(":memory:");

    const candidate = store.createRuleCandidate({
      projectId: "demo",
      category: "tooling",
      rule: "Use pnpm for package operations.",
      reason: "The workspace is configured for pnpm.",
      sourceEventId: null
    });

    vi.setSystemTime(new Date("2026-01-01T00:00:01.000Z"));
    const approved = store.approveRule(candidate.id);

    vi.setSystemTime(new Date("2026-01-01T00:00:02.000Z"));
    const rejected = store.rejectRule(candidate.id);

    expect(approved.updatedAt).toBe("2026-01-01T00:00:01.000Z");
    expect(rejected.updatedAt).toBe("2026-01-01T00:00:02.000Z");
  });

  it("records memory usages and updates last used timestamp", () => {
    const store = createStore(":memory:");
    const memory = store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "package-manager",
        rule: "Use pnpm for package management.",
        reason: "The workspace uses pnpm."
      }).id
    );
    const event = store.createEvent({
      sessionId: "session_1",
      category: "memory_injection",
      title: "Injected memory",
      body: "Injected 1 memory.",
      metadata: { projectId: "demo", memoryIds: [memory.id] }
    });

    const usage = store.recordMemoryUsage({
      projectId: "demo",
      memoryId: memory.id,
      sessionId: "session_1",
      eventId: event.id,
      adapter: "proxy",
      reason: "approved_project_memory"
    });

    const updated = store.getRule(memory.id);
    expect(usage.memoryId).toBe(memory.id);
    expect(usage.eventId).toBe(event.id);
    expect(updated?.lastUsedAt).toBe(usage.injectedAt);
    expect(store.listMemoryUsages(memory.id)).toEqual([usage]);
  });

  it("records memory injection events and usages atomically", () => {
    const store = createStore(":memory:");
    const memory = store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "package-manager",
        rule: "Use pnpm for package management.",
        reason: "The workspace uses pnpm."
      }).id
    );

    const event = store.recordMemoryInjectionEvent({
      sessionId: "session_1",
      title: "Injected memory",
      body: "Injected 1 memory.",
      metadata: { projectId: "demo", memoryIds: [memory.id] },
      usages: [
        {
          projectId: "demo",
          memoryId: memory.id,
          sessionId: "session_1",
          adapter: "proxy",
          reason: "approved_project_memory"
        }
      ]
    });

    expect(event.category).toBe("memory_injection");
    expect(store.listMemoryUsages(memory.id)).toEqual([
      expect.objectContaining({ eventId: event.id, memoryId: memory.id })
    ]);
  });

  it("does not leave partial injection audit rows when a memory is not injectable", () => {
    const store = createStore(":memory:");
    const approved = store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "package-manager",
        rule: "Use pnpm for package management.",
        reason: "The workspace uses pnpm."
      }).id
    );
    const pending = store.createRuleCandidate({
      projectId: "demo",
      category: "editor",
      rule: "Use the project editor settings.",
      reason: "Pending memory."
    });

    expect(() =>
      store.recordMemoryInjectionEvent({
        sessionId: "session_1",
        title: "Injected memories",
        body: "Injected 2 memories.",
        metadata: { projectId: "demo", memoryIds: [approved.id, pending.id] },
        usages: [
          {
            projectId: "demo",
            memoryId: approved.id,
            sessionId: "session_1",
            adapter: "proxy",
            reason: "approved_project_memory"
          },
          {
            projectId: "demo",
            memoryId: pending.id,
            sessionId: "session_1",
            adapter: "proxy",
            reason: "approved_project_memory"
          }
        ]
      })
    ).toThrow(`Rule is not injectable: ${pending.id}`);

    expect(store.listEvents("session_1")).toEqual([]);
    expect(store.listMemoryUsages(approved.id)).toEqual([]);
    expect(store.listMemoryUsages(pending.id)).toEqual([]);
  });

  it("lists memory usages scoped to a project", () => {
    const databasePath = join(mkdtempSync(join(tmpdir(), "signal-recycler-store-")), "test.sqlite");
    const store = createStore(databasePath);
    const memory = store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "package-manager",
        rule: "Use pnpm for package management.",
        reason: "The workspace uses pnpm."
      }).id
    );
    const event = store.createEvent({
      sessionId: "session_1",
      category: "memory_injection",
      title: "Injected memory",
      body: "Injected 1 memory.",
      metadata: { projectId: "demo", memoryIds: [memory.id] }
    });
    const usage = store.recordMemoryUsage({
      projectId: "demo",
      memoryId: memory.id,
      sessionId: "session_1",
      eventId: event.id,
      adapter: "proxy",
      reason: "approved_project_memory"
    });
    const db = new DatabaseSync(databasePath);
    db.prepare(
      `INSERT INTO memory_usages (
        id, project_id, memory_id, session_id, event_id, adapter, reason, injected_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "usage_other_project",
      "other",
      memory.id,
      "other-session",
      "other-event",
      "proxy",
      "other_project_memory",
      "2026-01-01T00:00:00.000Z"
    );
    db.close();

    expect(store.listMemoryUsagesForProject("demo", memory.id)).toEqual([usage]);
  });

  it("clears memory usage audit rows during project memory reset", () => {
    const store = createStore(":memory:");
    const memory = store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "package-manager",
        rule: "Use pnpm for package management.",
        reason: "The workspace uses pnpm."
      }).id
    );
    const event = store.createEvent({
      sessionId: "proxy",
      category: "memory_injection",
      title: "Injected memory",
      body: "Injected 1 memory.",
      metadata: { projectId: "demo", memoryIds: [memory.id] }
    });
    store.recordMemoryUsage({
      projectId: "demo",
      memoryId: memory.id,
      sessionId: "proxy",
      eventId: event.id,
      adapter: "proxy",
      reason: "approved_project_memory"
    });

    const result = store.clearProjectMemory("demo");

    expect(result.memoryUsagesDeleted).toBe(1);
    expect(store.listMemoryUsages(memory.id)).toEqual([]);
  });

  it("does not record memory usage for nonexistent memory", () => {
    const store = createStore(":memory:");

    expect(() =>
      store.recordMemoryUsage({
        projectId: "demo",
        memoryId: "rule_missing",
        sessionId: "session_1",
        eventId: "event_1",
        adapter: "proxy",
        reason: "approved_project_memory"
      })
    ).toThrow("Rule not found for project: rule_missing");

    expect(store.listMemoryUsages("rule_missing")).toEqual([]);
  });

  it("does not record cross-project memory usage or update last used timestamp", () => {
    const store = createStore(":memory:");
    const otherProjectMemory = store.approveRule(
      store.createRuleCandidate({
        projectId: "other",
        category: "package-manager",
        rule: "Use pnpm for package management.",
        reason: "The workspace uses pnpm."
      }).id
    );

    expect(() =>
      store.recordMemoryUsage({
        projectId: "demo",
        memoryId: otherProjectMemory.id,
        sessionId: "session_1",
        eventId: "event_1",
        adapter: "proxy",
        reason: "approved_project_memory"
      })
    ).toThrow(`Rule not found for project: ${otherProjectMemory.id}`);

    expect(store.listMemoryUsages(otherProjectMemory.id)).toEqual([]);
    expect(store.getRule(otherProjectMemory.id)?.lastUsedAt).toBeNull();
  });

  it("does not record memory usage for pending memory", () => {
    const store = createStore(":memory:");
    const pendingMemory = store.createRuleCandidate({
      projectId: "demo",
      category: "package-manager",
      rule: "Use pnpm for package management.",
      reason: "The workspace uses pnpm."
    });

    expect(() => store.recordMemoryUsage(memoryUsageInput(pendingMemory.id))).toThrow(
      `Rule is not injectable: ${pendingMemory.id}`
    );
    expect(store.listMemoryUsages(pendingMemory.id)).toEqual([]);
    expect(store.getRule(pendingMemory.id)?.lastUsedAt).toBeNull();
  });

  it("does not record memory usage for rejected memory", () => {
    const store = createStore(":memory:");
    const rejectedMemory = store.rejectRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "package-manager",
        rule: "Use pnpm for package management.",
        reason: "The workspace uses pnpm."
      }).id
    );

    expect(() => store.recordMemoryUsage(memoryUsageInput(rejectedMemory.id))).toThrow(
      `Rule is not injectable: ${rejectedMemory.id}`
    );
    expect(store.listMemoryUsages(rejectedMemory.id)).toEqual([]);
    expect(store.getRule(rejectedMemory.id)?.lastUsedAt).toBeNull();
  });

  it("does not record memory usage for superseded memory", () => {
    const store = createStore(":memory:");
    const oldMemory = store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "package-manager",
        rule: "Use npm for package management.",
        reason: "Old instruction."
      }).id
    );
    const newMemory = store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "package-manager",
        rule: "Use pnpm for package management.",
        reason: "Corrected instruction."
      }).id
    );
    store.supersedeRule(oldMemory.id, newMemory.id);

    expect(() => store.recordMemoryUsage(memoryUsageInput(oldMemory.id))).toThrow(
      `Rule is not injectable: ${oldMemory.id}`
    );
    expect(store.listMemoryUsages(oldMemory.id)).toEqual([]);
    expect(store.getRule(oldMemory.id)?.lastUsedAt).toBeNull();
  });

  it("supersedes approved memory so old memory is no longer injectable", () => {
    const store = createStore(":memory:");
    const oldMemory = store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "package-manager",
        rule: "Use npm for package management.",
        reason: "Old instruction."
      }).id
    );
    const newMemory = store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "package-manager",
        rule: "Use pnpm for package management.",
        reason: "Corrected instruction."
      }).id
    );

    const superseded = store.supersedeRule(oldMemory.id, newMemory.id);

    expect(superseded.supersededBy).toBe(newMemory.id);
    expect(store.listApprovedRules("demo").map((r) => r.id)).toEqual([newMemory.id]);
  });

  it("searches approved memories with FTS and BM25 ranking", () => {
    const store = createStore(":memory:");
    const relevant = store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "package-manager",
        rule: "Use pnpm test instead of npm test.",
        reason: "The repo uses pnpm workspaces."
      }).id
    );
    store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "theme",
        rule: "Use the approved theme tokens.",
        reason: "Theme work follows the design system."
      }).id
    );

    const results = store.searchApprovedMemories({
      projectId: "demo",
      query: "validate tests with package manager",
      limit: 1
    });

    expect(results.map((result) => result.memory.id)).toEqual([relevant.id]);
    expect(results[0]?.rank).toBe(1);
    expect(results[0]?.score).toBeGreaterThan(0);
  });

  it("does not return rejected, superseded, or cross-project memories from search", () => {
    const store = createStore(":memory:");
    const current = store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "package-manager",
        rule: "Use pnpm test for validation.",
        reason: "Current project convention."
      }).id
    );
    const old = store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "package-manager",
        rule: "Use npm test for validation.",
        reason: "Old convention."
      }).id
    );
    store.supersedeRule(old.id, current.id);
    const rejected = store.createRuleCandidate({
      projectId: "demo",
      category: "package-manager",
      rule: "Use yarn test for validation.",
      reason: "Rejected convention."
    });
    store.rejectRule(rejected.id);
    store.approveRule(
      store.createRuleCandidate({
        projectId: "other",
        category: "package-manager",
        rule: "Use npm test for validation.",
        reason: "Other project convention."
      }).id
    );

    const results = store.searchApprovedMemories({
      projectId: "demo",
      query: "validation test command",
      limit: 10
    });

    expect(results.map((result) => result.memory.id)).toEqual([current.id]);
  });

  it("returns the requested number of unique approved memory matches", () => {
    const store = createStore(":memory:");
    const first = store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "package-manager",
        rule: "Use pnpm test instead of npm test.",
        reason: "The repo uses pnpm workspaces."
      }).id
    );
    store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "package-manager",
        rule: "Use pnpm test instead of npm test.",
        reason: "Duplicate imported compatibility rule."
      }).id
    );
    const second = store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "package-manager",
        rule: "Use pnpm install instead of npm install.",
        reason: "The repo uses pnpm workspaces."
      }).id
    );

    const results = store.searchApprovedMemories({
      projectId: "demo",
      query: "package manager pnpm",
      limit: 2
    });

    expect(results).toHaveLength(2);
    expect(results.map((result) => result.memory.id)).toEqual(
      expect.arrayContaining([first.id, second.id])
    );
    expect(results.map((result) => result.rank)).toEqual([1, 2]);
  });

  it("returns no memories for empty or stopword-only search queries", () => {
    const store = createStore(":memory:");
    store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "package-manager",
        rule: "Use pnpm test for validation.",
        reason: "Current project convention."
      }).id
    );

    expect(
      store.searchApprovedMemories({
        projectId: "demo",
        query: "   ",
        limit: 10
      })
    ).toEqual([]);
    expect(
      store.searchApprovedMemories({
        projectId: "demo",
        query: "the and with",
        limit: 10
      })
    ).toEqual([]);
  });

  it("does not supersede memory with itself", () => {
    const store = createStore(":memory:");
    const memory = store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "package-manager",
        rule: "Use pnpm for package management.",
        reason: "Current instruction."
      }).id
    );

    expect(() => store.supersedeRule(memory.id, memory.id)).toThrow(
      `Rule cannot supersede itself: ${memory.id}`
    );
    expect(store.getRule(memory.id)?.supersededBy).toBeNull();
  });

  it("does not supersede memory with nonexistent replacement", () => {
    const store = createStore(":memory:");
    const oldMemory = store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "package-manager",
        rule: "Use npm for package management.",
        reason: "Old instruction."
      }).id
    );

    expect(() => store.supersedeRule(oldMemory.id, "rule_missing")).toThrow(
      "Replacement rule not found: rule_missing"
    );
    expect(store.getRule(oldMemory.id)?.supersededBy).toBeNull();
  });

  it("does not supersede memory with cross-project replacement", () => {
    const store = createStore(":memory:");
    const oldMemory = store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "package-manager",
        rule: "Use npm for package management.",
        reason: "Old instruction."
      }).id
    );
    const otherProjectMemory = store.approveRule(
      store.createRuleCandidate({
        projectId: "other",
        category: "package-manager",
        rule: "Use pnpm for package management.",
        reason: "Corrected instruction."
      }).id
    );

    expect(() => store.supersedeRule(oldMemory.id, otherProjectMemory.id)).toThrow(
      `Replacement rule not found in project: ${otherProjectMemory.id}`
    );
    expect(store.getRule(oldMemory.id)?.supersededBy).toBeNull();
  });

  it("does not supersede memory with non-approved replacement", () => {
    const store = createStore(":memory:");
    const oldMemory = store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "package-manager",
        rule: "Use npm for package management.",
        reason: "Old instruction."
      }).id
    );
    const pendingMemory = store.createRuleCandidate({
      projectId: "demo",
      category: "package-manager",
      rule: "Use pnpm for package management.",
      reason: "Corrected instruction."
    });

    expect(() => store.supersedeRule(oldMemory.id, pendingMemory.id)).toThrow(
      `Replacement rule is not approved: ${pendingMemory.id}`
    );
    expect(store.getRule(oldMemory.id)?.supersededBy).toBeNull();
  });

  it("updates rule updatedAt when superseding memory", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const store = createStore(":memory:");
    const oldMemory = store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "package-manager",
        rule: "Use npm for package management.",
        reason: "Old instruction."
      }).id
    );
    const newMemory = store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "package-manager",
        rule: "Use pnpm for package management.",
        reason: "Corrected instruction."
      }).id
    );

    vi.setSystemTime(new Date("2026-01-01T00:00:01.000Z"));
    const superseded = store.supersedeRule(oldMemory.id, newMemory.id);

    expect(superseded.updatedAt).toBe("2026-01-01T00:00:01.000Z");
  });

  it("migrates existing v1 rule rows with memory defaults", () => {
    const path = createTempDbPath();
    const db = new DatabaseSync(path);
    db.exec(`
      CREATE TABLE rules (
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
      CREATE TABLE schema_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      INSERT INTO schema_meta (key, value) VALUES ('schema_version', '1');
      INSERT INTO rules (
        id, project_id, status, category, rule, reason, source_event_id, created_at, approved_at
      ) VALUES (
        'rule_existing', 'demo', 'pending', 'tooling', 'Use pnpm.', 'Legacy v1 row.',
        NULL, '2026-01-01T00:00:00.000Z', NULL
      );
    `);
    db.close();

    const store = createStore(path);
    const rule = store.getRule("rule_existing");

    expect(store.inspectSchema().schemaVersion).toBe(3);
    expect(rule).toMatchObject({
      memoryType: "rule",
      scope: { type: "project", value: null },
      source: { kind: "manual", author: "local-user" },
      confidence: "medium",
      syncStatus: "local",
      updatedAt: "2026-01-01T00:00:00.000Z"
    });
  });

  it("migrates existing v1 extracted rule rows with event provenance", () => {
    const path = createTempDbPath();
    const db = new DatabaseSync(path);
    db.exec(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        metadata TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE rules (
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
      CREATE TABLE schema_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      INSERT INTO schema_meta (key, value) VALUES ('schema_version', '1');
      INSERT INTO sessions (id, project_id, title, created_at)
      VALUES ('session_existing', 'demo', 'Existing session', '2026-01-01T00:00:00.000Z');
      INSERT INTO events (id, session_id, category, title, body, metadata, created_at)
      VALUES (
        'event_existing', 'session_existing', 'codex_event', 'Codex response',
        'Use pnpm.', '{}', '2026-01-01T00:00:01.000Z'
      );
      INSERT INTO rules (
        id, project_id, status, category, rule, reason, source_event_id, created_at, approved_at
      ) VALUES (
        'rule_existing', 'demo', 'approved', 'tooling', 'Use pnpm.', 'Learned from run.',
        'event_existing', '2026-01-01T00:00:02.000Z', '2026-01-01T00:00:03.000Z'
      );
    `);
    db.close();

    const store = createStore(path);
    const rule = store.getRule("rule_existing");

    expect(rule?.source).toEqual({
      kind: "event",
      sessionId: "session_existing",
      eventId: "event_existing"
    });
  });

  it("repairs v2 rows that still have manual provenance for extracted rules", () => {
    const path = createTempDbPath();
    const db = new DatabaseSync(path);
    db.exec(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        metadata TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE rules (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        status TEXT NOT NULL,
        category TEXT NOT NULL,
        rule TEXT NOT NULL,
        reason TEXT NOT NULL,
        source_event_id TEXT,
        created_at TEXT NOT NULL,
        approved_at TEXT,
        memory_type TEXT NOT NULL DEFAULT 'rule',
        scope TEXT NOT NULL DEFAULT '{"type":"project","value":null}',
        source TEXT NOT NULL DEFAULT '{"kind":"manual","author":"local-user"}',
        confidence TEXT NOT NULL DEFAULT 'medium',
        last_used_at TEXT,
        superseded_by TEXT,
        sync_status TEXT NOT NULL DEFAULT 'local',
        updated_at TEXT
      );
      CREATE TABLE schema_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      INSERT INTO schema_meta (key, value) VALUES ('schema_version', '2');
      INSERT INTO sessions (id, project_id, title, created_at)
      VALUES ('session_existing', 'demo', 'Existing session', '2026-01-01T00:00:00.000Z');
      INSERT INTO events (id, session_id, category, title, body, metadata, created_at)
      VALUES (
        'event_existing', 'session_existing', 'codex_event', 'Codex response',
        'Use pnpm.', '{}', '2026-01-01T00:00:01.000Z'
      );
      INSERT INTO rules (
        id, project_id, status, category, rule, reason, source_event_id, created_at, approved_at,
        memory_type, scope, source, confidence, last_used_at, superseded_by, sync_status, updated_at
      ) VALUES (
        'rule_existing', 'demo', 'approved', 'tooling', 'Use pnpm.', 'Learned from run.',
        'event_existing', '2026-01-01T00:00:02.000Z', '2026-01-01T00:00:03.000Z',
        'rule', '{"type":"project","value":null}', '{"kind":"manual","author":"local-user"}',
        'medium', NULL, NULL, 'local', '2026-01-01T00:00:02.000Z'
      );
    `);
    db.close();

    const store = createStore(path);
    const rule = store.getRule("rule_existing");

    expect(rule?.source).toEqual({
      kind: "event",
      sessionId: "session_existing",
      eventId: "event_existing"
    });
  });

  it("resumes a partially applied v2 migration without duplicate alter failures", () => {
    const path = createTempDbPath();
    const db = new DatabaseSync(path);
    db.exec(`
      CREATE TABLE rules (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        status TEXT NOT NULL,
        category TEXT NOT NULL,
        rule TEXT NOT NULL,
        reason TEXT NOT NULL,
        source_event_id TEXT,
        created_at TEXT NOT NULL,
        approved_at TEXT,
        memory_type TEXT NOT NULL DEFAULT 'rule'
      );
      CREATE TABLE schema_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      INSERT INTO schema_meta (key, value) VALUES ('schema_version', '1');
      INSERT INTO rules (
        id, project_id, status, category, rule, reason, source_event_id, created_at, approved_at, memory_type
      ) VALUES (
        'rule_partial', 'demo', 'pending', 'tooling', 'Use pnpm.', 'Partially migrated row.',
        NULL, '2026-01-01T00:00:00.000Z', NULL, 'rule'
      );
    `);
    db.close();

    const store = createStore(path);
    const rule = store.getRule("rule_partial");

    expect(store.inspectSchema().schemaVersion).toBe(3);
    expect(rule?.updatedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("validates persisted rule enum values when mapping rows", () => {
    const path = createTempDbPath();
    const db = new DatabaseSync(path);
    db.exec(`
      CREATE TABLE rules (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        status TEXT NOT NULL,
        category TEXT NOT NULL,
        rule TEXT NOT NULL,
        reason TEXT NOT NULL,
        source_event_id TEXT,
        created_at TEXT NOT NULL,
        approved_at TEXT,
        memory_type TEXT NOT NULL DEFAULT 'rule',
        scope TEXT NOT NULL DEFAULT '{"type":"project","value":null}',
        source TEXT NOT NULL DEFAULT '{"kind":"manual","author":"local-user"}',
        confidence TEXT NOT NULL DEFAULT 'medium',
        last_used_at TEXT,
        superseded_by TEXT,
        sync_status TEXT NOT NULL DEFAULT 'local',
        updated_at TEXT
      );
      CREATE TABLE schema_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      INSERT INTO schema_meta (key, value) VALUES ('schema_version', '2');
      INSERT INTO rules (
        id, project_id, status, category, rule, reason, source_event_id, created_at, approved_at,
        memory_type, scope, source, confidence, last_used_at, superseded_by, sync_status, updated_at
      ) VALUES (
        'rule_invalid', 'demo', 'pending', 'tooling', 'Use pnpm.', 'Invalid enum row.',
        NULL, '2026-01-01T00:00:00.000Z', NULL, 'not-a-memory-type',
        '{"type":"project","value":null}', '{"kind":"manual","author":"local-user"}',
        'medium', NULL, NULL, 'local', '2026-01-01T00:00:00.000Z'
      );
    `);
    db.close();

    const store = createStore(path);

    expect(() => store.getRule("rule_invalid")).toThrow();
  });
});

function createTempDbPath(): string {
  return join(mkdtempSync(join(tmpdir(), "signal-recycler-store-")), "store.sqlite");
}

function memoryUsageInput(memoryId: string) {
  return {
    projectId: "demo",
    memoryId,
    sessionId: "session_1",
    eventId: "event_1",
    adapter: "proxy",
    reason: "approved_project_memory"
  };
}
