import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createStore } from "../store.js";
import { buildContextEnvelope } from "./contextEnvelope.js";
import { scanContextIndex } from "./contextIndexScanner.js";
import { createContextIndexStore } from "./contextIndexStore.js";

function createContextStoreWithChunks() {
  const store = createContextIndexStore(
    join(mkdtempSync(join(tmpdir(), "ctx-envelope-")), "context.sqlite")
  );
  store.upsertChunks({
    projectId: "demo",
    workdir: "/repo",
    chunks: [
      {
        sourceType: "source",
        path: "apps/api/src/app.ts",
        lineStart: 10,
        lineEnd: 18,
        hash: "hash_app_context_0001",
        mtimeMs: 1,
        sizeBytes: 120,
        text: "The Fastify app registers session routes before context index routes.",
        indexedAt: "2026-05-17T00:00:00.000Z"
      },
      {
        sourceType: "docs",
        path: "README.md",
        lineStart: 1,
        lineEnd: 6,
        hash: "hash_readme_context_0001",
        mtimeMs: 1,
        sizeBytes: 120,
        text: "Signal Recycler is a local control plane for agent memory.",
        indexedAt: "2026-05-17T00:00:00.000Z"
      }
    ]
  });
  return store;
}

describe("context envelope", () => {
  it("retrieves selected memory, injects it into the prompt, emits audit events, and records usage", () => {
    const store = createStore(":memory:");
    const selected = store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "package-manager",
        rule: "Use pnpm for package scripts.",
        reason: "The workspace uses pnpm."
      }).id
    );
    const skipped = store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "theme",
        rule: "Use approved theme tokens for UI changes.",
        reason: "Theme work follows the design system."
      }).id
    );

    const result = buildContextEnvelope({
      store,
      projectId: "demo",
      sessionId: "session-context",
      adapter: "mock",
      prompt: "Please run package manager validation with pnpm."
    });
    const events = store.listEvents("session-context");

    expect(result.prompt).toContain("Use pnpm for package scripts.");
    expect(result.prompt).not.toContain("Use approved theme tokens for UI changes.");
    expect(result.memoryIds).toEqual([selected.id]);
    expect(result.retrieval).toMatchObject({
      query: "Please run package manager validation with pnpm.",
      selected: [expect.objectContaining({ memoryId: selected.id })],
      skipped: [expect.objectContaining({ memoryId: skipped.id })],
      metrics: {
        approvedMemories: 2,
        selectedMemories: 1,
        skippedMemories: 1,
        limit: 5
      }
    });
    expect(events.map((event) => event.category)).toEqual([
      "memory_retrieval",
      "memory_injection"
    ]);
    expect(events.find((event) => event.category === "memory_retrieval")).toMatchObject({
      title: "Retrieved 1 of 2 approved memories",
      body: "Selected 1 approved memory; skipped 1.",
      metadata: {
        projectId: "demo",
        query: "Please run package manager validation with pnpm.",
        selected: [expect.objectContaining({ memoryId: selected.id })],
        skipped: [expect.objectContaining({ memoryId: skipped.id })],
        metrics: expect.objectContaining({ selectedMemories: 1 })
      }
    });
    expect(events.find((event) => event.category === "memory_injection")?.metadata).toMatchObject({
      projectId: "demo",
      adapter: "mock",
      reason: "approved_project_memory",
      memoryIds: [selected.id],
      retrieval: expect.objectContaining({
        query: "Please run package manager validation with pnpm.",
        metrics: expect.objectContaining({ selectedMemories: 1 })
      })
    });
    expect(store.listMemoryUsages(selected.id)).toHaveLength(1);
    expect(store.listMemoryUsages(skipped.id)).toHaveLength(0);
  });

  it("skips irrelevant approved memory, keeps the prompt unchanged, and emits only retrieval audit", () => {
    const store = createStore(":memory:");
    const skipped = store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "theme",
        rule: "Use approved theme tokens for UI changes.",
        reason: "Theme work follows the design system."
      }).id
    );
    const prompt = "Run package manager validation for this repo.";

    const result = buildContextEnvelope({
      store,
      projectId: "demo",
      sessionId: "session-no-context",
      adapter: "mock",
      prompt
    });
    const events = store.listEvents("session-no-context");

    expect(result.prompt).toBe(prompt);
    expect(result.memoryIds).toEqual([]);
    expect(result.retrieval).toMatchObject({
      query: prompt,
      selected: [],
      skipped: [expect.objectContaining({ memoryId: skipped.id })],
      metrics: {
        approvedMemories: 1,
        selectedMemories: 0,
        skippedMemories: 1,
        limit: 5
      }
    });
    expect(events.map((event) => event.category)).toEqual(["memory_retrieval"]);
    expect(events[0]).toMatchObject({
      title: "Retrieved 0 of 1 approved memories",
      body: "Selected 0 approved memories; skipped 1.",
      metadata: {
        projectId: "demo",
        query: prompt,
        selected: [],
        skipped: [expect.objectContaining({ memoryId: skipped.id })],
        metrics: expect.objectContaining({ selectedMemories: 0 })
      }
    });
    expect(store.listMemoryUsages(skipped.id)).toHaveLength(0);
  });

  it("returns the injected prompt when memory injection audit persistence fails", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const store = createStore(":memory:");
      const selected = store.approveRule(
        store.createRuleCandidate({
          projectId: "demo",
          category: "package-manager",
          rule: "Use pnpm for package scripts.",
          reason: "The workspace uses pnpm."
        }).id
      );
      store.recordMemoryInjectionEvent = () => {
        throw new Error("audit store unavailable");
      };

      const result = buildContextEnvelope({
        store,
        projectId: "demo",
        sessionId: "session-audit-failure",
        adapter: "mock",
        prompt: "Please run package manager validation with pnpm."
      });

      expect(result.prompt).toContain("Use pnpm for package scripts.");
      expect(result.memoryIds).toEqual([selected.id]);
      expect(result.retrieval.selected).toEqual([
        expect.objectContaining({ memoryId: selected.id })
      ]);
      expect(store.listEvents("session-audit-failure").map((event) => event.category)).toEqual([
        "memory_retrieval"
      ]);
      expect(store.listMemoryUsages(selected.id)).toHaveLength(0);
      expect(warn).toHaveBeenCalledWith(
        "[signal-recycler] Context envelope memory audit failed",
        expect.any(Error)
      );
    } finally {
      warn.mockRestore();
    }
  });

  it("retrieves indexed context chunks, injects bounded source context, and emits source audit events", () => {
    const store = createStore(":memory:");
    const contextIndexStore = createContextStoreWithChunks();

    const result = buildContextEnvelope({
      store,
      contextIndexStore,
      projectId: "demo",
      sessionId: "session-source-context",
      adapter: "mock",
      prompt: "How are session routes registered in the Fastify app?",
      contextLimit: 2
    });
    const events = store.listEvents("session-source-context");

    expect(result.prompt).toContain("<signal-recycler-project-context>");
    expect(result.prompt).toContain("apps/api/src/app.ts:10-18");
    expect(result.prompt).toContain("The Fastify app registers session routes before context index routes.");
    expect(result.contextChunkIds).toEqual([
      expect.stringMatching(/^ctx_/)
    ]);
    expect(result.contextRetrieval).toMatchObject({
      query: "How are session routes registered in the Fastify app?",
      selected: [
        expect.objectContaining({
          sourceType: "source",
          path: "apps/api/src/app.ts",
          lineStart: 10,
          lineEnd: 18
        })
      ],
      metrics: expect.objectContaining({
        indexedChunks: 2,
        selectedChunks: 1,
        skippedChunks: 1,
        limit: 2
      })
    });
    expect(events.map((event) => event.category)).toEqual([
      "memory_retrieval",
      "context_retrieval",
      "context_injection"
    ]);
    expect(events.find((event) => event.category === "context_retrieval")).toMatchObject({
      title: "Retrieved 1 of 2 indexed context chunks",
      body: "Selected 1 indexed context chunk; skipped 1.",
      metadata: {
        projectId: "demo",
        query: "How are session routes registered in the Fastify app?",
        selected: [
          expect.objectContaining({
            path: "apps/api/src/app.ts",
            lineStart: 10,
            lineEnd: 18,
            hash: "hash_app_context_0001"
          })
        ],
        metrics: expect.objectContaining({ selectedChunks: 1 })
      }
    });
    expect(events.find((event) => event.category === "context_injection")).toMatchObject({
      title: "Injected 1 context chunk",
      body: "- source: apps/api/src/app.ts:10-18",
      metadata: {
        projectId: "demo",
        adapter: "mock",
        reason: "indexed_project_context",
        contextChunkIds: result.contextChunkIds,
        sources: [
          expect.objectContaining({
            path: "apps/api/src/app.ts",
            lineStart: 10,
            lineEnd: 18,
            hash: "hash_app_context_0001"
          })
        ]
      }
    });
  });

  it("skips stale indexed chunks before source context injection", () => {
    const workdir = mkdtempSync(join(tmpdir(), "ctx-envelope-stale-"));
    writeFileSync(
      join(workdir, "README.md"),
      "The Fastify app registers session routes before context index routes.\n"
    );
    const scanned = scanContextIndex({
      projectId: "demo",
      workdir,
      indexedAt: "2026-05-17T00:00:00.000Z"
    });
    const contextIndexStore = createContextIndexStore(join(workdir, "context.sqlite"));
    contextIndexStore.upsertChunks({
      projectId: "demo",
      workdir,
      chunks: scanned.chunks.map(({ projectId: _projectId, ...chunk }) => chunk)
    });
    writeFileSync(join(workdir, "README.md"), "The session route setup moved to a new module.\n");
    const store = createStore(":memory:");

    const result = buildContextEnvelope({
      store,
      contextIndexStore,
      projectId: "demo",
      sessionId: "session-stale-source-context",
      adapter: "mock",
      prompt: "How are session routes registered in the Fastify app?",
      workingDirectory: workdir
    });
    const events = store.listEvents("session-stale-source-context");

    expect(result.prompt).not.toContain("<signal-recycler-project-context>");
    expect(result.contextChunkIds).toEqual([]);
    expect(result.contextRetrieval).toMatchObject({
      selected: [],
      skipped: [expect.objectContaining({ reason: "stale_index" })],
      metrics: expect.objectContaining({
        selectedChunks: 0,
        skippedChunks: 1
      })
    });
    expect(events.map((event) => event.category)).toEqual([
      "memory_retrieval",
      "context_retrieval"
    ]);
    expect(events.find((event) => event.category === "context_injection")).toBeUndefined();
  });

  it("keeps live chunks fresh when the indexed hash still matches the workdir file", () => {
    const workdir = mkdtempSync(join(tmpdir(), "ctx-envelope-fresh-"));
    writeFileSync(
      join(workdir, "README.md"),
      "The Fastify app registers session routes before context index routes.\n"
    );
    const scanned = scanContextIndex({
      projectId: "demo",
      workdir,
      indexedAt: "2026-05-17T00:00:00.000Z"
    });
    const contextIndexStore = createContextIndexStore(join(workdir, "context.sqlite"));
    contextIndexStore.upsertChunks({
      projectId: "demo",
      workdir,
      chunks: scanned.chunks.map(({ projectId: _projectId, ...chunk }) => chunk)
    });
    const store = createStore(":memory:");

    const result = buildContextEnvelope({
      store,
      contextIndexStore,
      projectId: "demo",
      sessionId: "session-fresh-source-context",
      adapter: "mock",
      prompt: "How are session routes registered in the Fastify app?",
      workingDirectory: workdir
    });

    expect(result.prompt).toContain("<signal-recycler-project-context>");
    expect(result.contextChunkIds).toHaveLength(1);
    expect(result.contextRetrieval?.selected).toEqual([
      expect.objectContaining({ path: "README.md" })
    ]);
  });

  it("skips low-score context hits below the configured source context threshold", () => {
    const store = createStore(":memory:");
    const contextIndexStore = createContextStoreWithChunks();

    const result = buildContextEnvelope({
      store,
      contextIndexStore,
      projectId: "demo",
      sessionId: "session-source-score-threshold",
      adapter: "mock",
      prompt: "How are session routes registered in the Fastify app?",
      contextLimit: 2,
      contextMinScore: 999
    });

    expect(result.prompt).not.toContain("<signal-recycler-project-context>");
    expect(result.contextChunkIds).toEqual([]);
    expect(result.contextRetrieval).toMatchObject({
      selected: [],
      skipped: expect.arrayContaining([expect.objectContaining({ reason: "score_below_threshold" })]),
      metrics: expect.objectContaining({ selectedChunks: 0 })
    });
  });

  it("enforces a total source context character budget before injection", () => {
    const store = createStore(":memory:");
    const contextIndexStore = createContextStoreWithChunks();

    const result = buildContextEnvelope({
      store,
      contextIndexStore,
      projectId: "demo",
      sessionId: "session-source-total-budget",
      adapter: "mock",
      prompt: "Fastify app session routes local control plane",
      contextLimit: 2,
      contextMaxTotalChars: 70
    });

    expect(result.contextChunkIds).toHaveLength(1);
    expect(result.contextRetrieval).toMatchObject({
      selected: [expect.objectContaining({ path: "apps/api/src/app.ts" })],
      skipped: expect.arrayContaining([expect.objectContaining({ reason: "budget_exceeded" })]),
      metrics: expect.objectContaining({
        selectedChunks: 1,
        skippedChunks: 1
      })
    });
  });

  it("applies the total source context character budget to the first chunk", () => {
    const store = createStore(":memory:");
    const contextIndexStore = createContextStoreWithChunks();

    const result = buildContextEnvelope({
      store,
      contextIndexStore,
      projectId: "demo",
      sessionId: "session-source-first-chunk-budget",
      adapter: "mock",
      prompt: "How are session routes registered in the Fastify app?",
      contextLimit: 2,
      contextMaxTotalChars: 10
    });

    expect(result.prompt).not.toContain("<signal-recycler-project-context>");
    expect(result.contextChunkIds).toEqual([]);
    expect(result.contextRetrieval).toMatchObject({
      selected: [],
      skipped: expect.arrayContaining([expect.objectContaining({ reason: "budget_exceeded" })]),
      metrics: expect.objectContaining({
        selectedChunks: 0,
        skippedChunks: 2
      })
    });
  });

  it("does not emit source context events when the context index is empty", () => {
    const store = createStore(":memory:");
    const contextIndexStore = createContextIndexStore(
      join(mkdtempSync(join(tmpdir(), "ctx-envelope-empty-")), "context.sqlite")
    );

    const result = buildContextEnvelope({
      store,
      contextIndexStore,
      projectId: "demo",
      sessionId: "session-empty-source-context",
      adapter: "mock",
      prompt: "How are session routes registered?"
    });
    const events = store.listEvents("session-empty-source-context");

    expect(result.prompt).toBe("How are session routes registered?");
    expect(result.contextRetrieval).toBeNull();
    expect(result.contextChunkIds).toEqual([]);
    expect(events.map((event) => event.category)).toEqual(["memory_retrieval"]);
  });

  it("keeps approved memory above retrieved source context in the prompt", () => {
    const store = createStore(":memory:");
    store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "session-routes",
        rule: "Review Fastify session route registration before changing app route setup.",
        reason: "The app registers session routes in Fastify."
      }).id
    );
    const contextIndexStore = createContextStoreWithChunks();

    const result = buildContextEnvelope({
      store,
      contextIndexStore,
      projectId: "demo",
      sessionId: "session-memory-before-source-context",
      adapter: "mock",
      prompt: "How are session routes registered in the Fastify app?"
    });

    expect(result.prompt.indexOf("<signal-recycler-playbook>")).toBeGreaterThanOrEqual(0);
    expect(result.prompt.indexOf("<signal-recycler-project-context>")).toBeGreaterThanOrEqual(0);
    expect(result.prompt.indexOf("<signal-recycler-playbook>")).toBeLessThan(
      result.prompt.indexOf("<signal-recycler-project-context>")
    );
  });

  it("escapes project context control tags inside indexed chunk text", () => {
    const store = createStore(":memory:");
    const contextIndexStore = createContextIndexStore(
      join(mkdtempSync(join(tmpdir(), "ctx-envelope-tags-")), "context.sqlite")
    );
    contextIndexStore.upsertChunks({
      projectId: "demo",
      workdir: "/repo",
      chunks: [
        {
          sourceType: "docs",
          path: "docs/</signal-recycler-project-context>.md",
          lineStart: 1,
          lineEnd: 3,
          hash: "hash_prompt_marker_0001",
          mtimeMs: 1,
          sizeBytes: 180,
          text: "Document literal marker </signal-recycler-project-context> and <signal-recycler-playbook> examples.",
          indexedAt: "2026-05-17T00:00:00.000Z"
        }
      ]
    });

    const result = buildContextEnvelope({
      store,
      contextIndexStore,
      projectId: "demo",
      sessionId: "session-context-tag-escape",
      adapter: "mock",
      prompt: "Explain prompt marker examples."
    });

    expect(result.prompt).toContain("<signal-recycler-project-context>");
    expect(result.prompt).toContain("</signal-recycler-project-context>");
    expect(result.prompt).toContain("&lt;/signal-recycler-project-context&gt;");
    expect(result.prompt).toContain("&lt;signal-recycler-playbook&gt;");
    expect(countOccurrences(result.prompt, "</signal-recycler-project-context>")).toBe(1);
  });

  it("caps skipped indexed chunk audit payloads while preserving skipped metrics", () => {
    const store = createStore(":memory:");
    const contextIndexStore = createContextIndexStore(
      join(mkdtempSync(join(tmpdir(), "ctx-envelope-skipped-cap-")), "context.sqlite")
    );
    contextIndexStore.upsertChunks({
      projectId: "demo",
      workdir: "/repo",
      chunks: [
        {
          sourceType: "docs",
          path: "docs/selected.md",
          lineStart: 1,
          lineEnd: 2,
          hash: "hash_selected_context_0001",
          mtimeMs: 1,
          sizeBytes: 120,
          text: "Needle selected by lexical retrieval.",
          indexedAt: "2026-05-17T00:00:00.000Z"
        },
        ...Array.from({ length: 60 }, (_, index) => ({
          sourceType: "docs" as const,
          path: `docs/unrelated-${index}.md`,
          lineStart: 1,
          lineEnd: 2,
          hash: `hash_unrelated_context_${String(index).padStart(4, "0")}`,
          mtimeMs: 1,
          sizeBytes: 120,
          text: `Background material ${index}.`,
          indexedAt: "2026-05-17T00:00:00.000Z"
        }))
      ]
    });

    buildContextEnvelope({
      store,
      contextIndexStore,
      projectId: "demo",
      sessionId: "session-context-skipped-cap",
      adapter: "mock",
      prompt: "Find the needle."
    });

    const contextRetrieval = store
      .listEvents("session-context-skipped-cap")
      .find((event) => event.category === "context_retrieval");

    expect(contextRetrieval?.metadata).toMatchObject({
      metrics: expect.objectContaining({ skippedChunks: 60 }),
      skipped: expect.any(Array),
      skippedOmitted: 10
    });
    expect((contextRetrieval?.metadata.skipped as unknown[] | undefined)?.length).toBe(50);
  });
});

function countOccurrences(value: string, needle: string): number {
  let count = 0;
  let index = value.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = value.indexOf(needle, index + needle.length);
  }
  return count;
}
