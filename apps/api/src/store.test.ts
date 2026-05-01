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

    expect(internals.schemaVersion).toBe(2);
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

  it("migrates rule rows into memory records with provenance defaults", () => {
    const store = createStore(":memory:");

    const candidate = store.createRuleCandidate({
      projectId: "demo",
      category: "package-manager",
      rule: "Use pnpm for package management.",
      reason: "The workspace is configured for pnpm.",
      sourceEventId: null
    });

    expect(store.inspectSchema().schemaVersion).toBe(2);
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

    expect(store.inspectSchema().schemaVersion).toBe(2);
    expect(rule).toMatchObject({
      memoryType: "rule",
      scope: { type: "project", value: null },
      source: { kind: "manual", author: "local-user" },
      confidence: "medium",
      syncStatus: "local",
      updatedAt: "2026-01-01T00:00:00.000Z"
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

    expect(store.inspectSchema().schemaVersion).toBe(2);
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
