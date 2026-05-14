import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createContextIndexStore } from "./contextIndexStore.js";
import { retrieveContextChunks } from "./contextIndexRetrieval.js";

function storeWithFixture() {
  const store = createContextIndexStore(
    join(mkdtempSync(join(tmpdir(), "ctx-retrieval-")), "db.sqlite")
  );
  store.upsertChunks({
    projectId: "demo",
    workdir: "/repo",
    chunks: [
      {
        sourceType: "agent_instructions",
        path: "AGENTS.md",
        lineStart: 1,
        lineEnd: 4,
        hash: "hash_agents_00000001",
        mtimeMs: 1,
        sizeBytes: 80,
        text: "Use pnpm type-check before reporting TypeScript changes.",
        indexedAt: "2026-05-14T00:00:00.000Z"
      },
      {
        sourceType: "source",
        path: "apps/web/src/middleware.ts",
        lineStart: 1,
        lineEnd: 9,
        hash: "hash_middleware_00000001",
        mtimeMs: 1,
        sizeBytes: 200,
        text: "Authentication middleware reads session cookies and returns unauthorized responses.",
        indexedAt: "2026-05-14T00:00:00.000Z"
      },
      {
        sourceType: "docs",
        path: "README.md",
        lineStart: 1,
        lineEnd: 4,
        hash: "hash_readme_00000001",
        mtimeMs: 1,
        sizeBytes: 120,
        text: "The project dashboard is a local control plane for agent memory.",
        indexedAt: "2026-05-14T00:00:00.000Z"
      }
    ]
  });
  return store;
}

describe("context index retrieval", () => {
  it("selects relevant source chunks without returning durable memory objects", () => {
    const result = retrieveContextChunks({
      store: storeWithFixture(),
      projectId: "demo",
      query: "where is auth middleware handled",
      limit: 3
    });

    expect(result.selected[0]).toMatchObject({
      path: "apps/web/src/middleware.ts",
      sourceType: "source"
    });
    expect(result.metrics.selectedChunks).toBe(1);
    expect(result.selected[0]).not.toHaveProperty("memoryId");
  });

  it("supports source type filters and records skipped reasons", () => {
    const result = retrieveContextChunks({
      store: storeWithFixture(),
      projectId: "demo",
      query: "pnpm type-check",
      limit: 3,
      sourceTypes: ["docs"]
    });

    expect(result.selected).toHaveLength(0);
    expect(result.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: "source_type_filter"
        }),
        expect.objectContaining({
          reason: "not_relevant"
        })
      ])
    );
    expect(result.metrics.indexedChunks).toBe(3);
    expect(result.metrics.selectedChunks).toBe(0);
    expect(result.metrics.skippedChunks).toBe(3);
  });

  it("treats an empty source type filter as unfiltered retrieval", () => {
    const result = retrieveContextChunks({
      store: storeWithFixture(),
      projectId: "demo",
      query: "pnpm type-check",
      limit: 3,
      sourceTypes: []
    });

    expect(result.selected[0]).toMatchObject({
      path: "AGENTS.md",
      sourceType: "agent_instructions"
    });
    expect(result.skipped.every((decision) => decision.reason === "not_relevant")).toBe(true);
  });

  it("does not fall back to broad retrieval for low-signal prompts", () => {
    const result = retrieveContextChunks({
      store: storeWithFixture(),
      projectId: "demo",
      query: "test",
      limit: 3
    });

    expect(result.selected).toEqual([]);
    expect(result.metrics).toMatchObject({
      indexedChunks: 3,
      selectedChunks: 0,
      skippedChunks: 3
    });
  });
});
