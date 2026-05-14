import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type ContextSourceType } from "@signal-recycler/shared";
import { createContextIndexStore } from "./contextIndexStore.js";

function dbPath() {
  return join(mkdtempSync(join(tmpdir(), "signal-recycler-context-index-")), "index.sqlite");
}

function chunk(overrides: {
  sourceType: ContextSourceType;
  path: string;
  hash: string;
  text: string;
  lineStart?: number;
  lineEnd?: number;
  indexedAt?: string;
}) {
  return {
    sourceType: overrides.sourceType,
    path: overrides.path,
    lineStart: overrides.lineStart ?? 1,
    lineEnd: overrides.lineEnd ?? 5,
    hash: overrides.hash,
    mtimeMs: 10,
    sizeBytes: 120,
    text: overrides.text,
    indexedAt: overrides.indexedAt ?? "2026-05-14T00:00:00.000Z"
  };
}

describe("context index store", () => {
  it("upserts chunks and reports coverage by source type", () => {
    const store = createContextIndexStore(dbPath());

    store.upsertChunks({
      projectId: "demo",
      workdir: "/repo",
      chunks: [
        chunk({
          sourceType: "docs",
          path: "README.md",
          hash: "hash_readme_00000001",
          text: "Use pnpm for package management."
        }),
        chunk({
          sourceType: "source",
          path: "apps/api/src/server.ts",
          hash: "hash_server_00000001",
          text: "Fastify server listens on the configured port."
        })
      ]
    });

    expect(store.status("demo", "/repo")).toMatchObject({
      projectId: "demo",
      workdir: "/repo",
      totalChunks: 2,
      totalFiles: 2,
      lastIndexedAt: "2026-05-14T00:00:00.000Z",
      bySourceType: expect.arrayContaining([
        { sourceType: "docs", files: 1, chunks: 1 },
        { sourceType: "source", files: 1, chunks: 1 }
      ])
    });
  });

  it("searches chunks with project isolation", () => {
    const store = createContextIndexStore(dbPath());
    store.upsertChunks({
      projectId: "demo",
      workdir: "/repo",
      chunks: [
        chunk({
          sourceType: "package",
          path: "package.json",
          hash: "hash_package_00000001",
          text: "scripts include pnpm test and pnpm type-check"
        })
      ]
    });
    store.upsertChunks({
      projectId: "other",
      workdir: "/other",
      chunks: [
        chunk({
          sourceType: "package",
          path: "package.json",
          hash: "hash_other_00000001",
          text: "scripts include npm test"
        })
      ]
    });

    const hits = store.search({
      projectId: "demo",
      query: "how do we run package validation",
      limit: 5
    });

    expect(hits).toHaveLength(1);
    expect(hits[0]?.chunk.path).toBe("package.json");
    expect(hits[0]?.chunk.projectId).toBe("demo");
    expect(hits[0]?.rank).toBe(1);
  });

  it("replaces a project index and removes stale chunks", () => {
    const store = createContextIndexStore(dbPath());
    store.upsertChunks({
      projectId: "demo",
      workdir: "/repo",
      chunks: [
        chunk({
          sourceType: "docs",
          path: "OLD.md",
          hash: "hash_old_00000001",
          text: "old content about obsolete setup"
        })
      ]
    });

    store.replaceProjectIndex({
      projectId: "demo",
      workdir: "/repo",
      chunks: [
        chunk({
          sourceType: "docs",
          path: "NEW.md",
          hash: "hash_new_00000001",
          text: "new content about current setup",
          indexedAt: "2026-05-14T00:01:00.000Z"
        })
      ]
    });

    expect(store.status("demo", "/repo").totalChunks).toBe(1);
    expect(store.search({ projectId: "demo", query: "obsolete", limit: 5 })).toHaveLength(0);
    expect(store.search({ projectId: "demo", query: "current setup", limit: 5 })[0]?.chunk.path).toBe(
      "NEW.md"
    );
  });

  it("replaces stale chunks for the same project path during incremental upsert", () => {
    const store = createContextIndexStore(dbPath());
    store.upsertChunks({
      projectId: "demo",
      workdir: "/repo",
      chunks: [
        chunk({
          sourceType: "docs",
          path: "README.md",
          hash: "hash_old_readme_00000001",
          text: "obsolete legacy bootstrap uses npm"
        })
      ]
    });

    store.upsertChunks({
      projectId: "demo",
      workdir: "/repo",
      chunks: [
        chunk({
          sourceType: "docs",
          path: "README.md",
          hash: "hash_new_readme_00000001",
          text: "current setup uses pnpm install"
        })
      ]
    });

    expect(store.status("demo", "/repo").totalChunks).toBe(1);
    expect(store.search({ projectId: "demo", query: "obsolete legacy", limit: 5 })).toEqual([]);
    expect(store.search({ projectId: "demo", query: "pnpm install", limit: 5 })[0]).toMatchObject({
      chunk: {
        path: "README.md",
        hash: "hash_new_readme_00000001"
      }
    });
  });

  it("removes stale chunks when an incremental path has no chunks", () => {
    const store = createContextIndexStore(dbPath());
    store.upsertChunks({
      projectId: "demo",
      workdir: "/repo",
      chunks: [
        chunk({
          sourceType: "docs",
          path: "README.md",
          hash: "hash_old_readme_00000001",
          text: "obsolete setup notes"
        })
      ]
    });

    store.upsertChunks({
      projectId: "demo",
      workdir: "/repo",
      replacedPaths: ["README.md"],
      chunks: []
    });

    expect(store.status("demo", "/repo").totalChunks).toBe(0);
    expect(store.search({ projectId: "demo", query: "obsolete", limit: 5 })).toEqual([]);
  });

  it("filters search results and chunk ids by source type", () => {
    const store = createContextIndexStore(dbPath());
    store.upsertChunks({
      projectId: "demo",
      workdir: "/repo",
      chunks: [
        chunk({
          sourceType: "docs",
          path: "README.md",
          hash: "hash_readme_00000001",
          text: "authentication middleware is documented here"
        }),
        chunk({
          sourceType: "source",
          path: "apps/api/src/auth.ts",
          hash: "hash_auth_00000001",
          text: "authentication middleware implementation"
        }),
        chunk({
          sourceType: "tests",
          path: "apps/api/src/auth.test.ts",
          hash: "hash_auth_test_00000001",
          text: "authentication middleware test coverage"
        })
      ]
    });

    const hits = store.search({
      projectId: "demo",
      query: "authentication middleware",
      limit: 5,
      sourceTypes: ["source", "tests"]
    });
    const listed = store.listChunkIds("demo", ["source", "tests"]);

    expect(hits.map((hit) => hit.chunk.sourceType)).toEqual(["source", "tests"]);
    expect(listed).toEqual([
      { id: hits[0]?.chunk.id, sourceType: "source" },
      { id: hits[1]?.chunk.id, sourceType: "tests" }
    ]);
  });

  it("returns no hits for empty or low-signal queries", () => {
    const store = createContextIndexStore(dbPath());
    store.upsertChunks({
      projectId: "demo",
      workdir: "/repo",
      chunks: [
        chunk({
          sourceType: "docs",
          path: "README.md",
          hash: "hash_readme_00000001",
          text: "Use pnpm for package management."
        })
      ]
    });

    expect(store.search({ projectId: "demo", query: "", limit: 5 })).toEqual([]);
    expect(store.search({ projectId: "demo", query: "the and of to", limit: 5 })).toEqual([]);
  });

  it("uses deterministic chunk ids from project, path, and hash", () => {
    const first = createContextIndexStore(dbPath());
    const second = createContextIndexStore(dbPath());
    const inputChunk = chunk({
      sourceType: "docs",
      path: "README.md",
      hash: "hash_readme_00000001",
      text: "Use pnpm for package management."
    });

    first.upsertChunks({ projectId: "demo", workdir: "/repo", chunks: [inputChunk] });
    second.upsertChunks({ projectId: "demo", workdir: "/repo", chunks: [inputChunk] });
    second.upsertChunks({ projectId: "other", workdir: "/other", chunks: [inputChunk] });

    expect(first.listChunkIds("demo")).toEqual(second.listChunkIds("demo"));
    expect(second.listChunkIds("other")[0]?.id).not.toBe(second.listChunkIds("demo")[0]?.id);
  });
});
