import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { scanContextIndex } from "./contextIndexScanner.js";

const fixtureRoot = resolve(process.cwd(), "../../fixtures/context-index-repo");

describe("context index scanner", () => {
  it("indexes docs, agent instructions, package files, config, source, and tests", () => {
    const result = scanContextIndex({
      projectId: "fixture",
      workdir: fixtureRoot,
      indexedAt: "2026-05-14T00:00:00.000Z"
    });

    expect(result.chunks.map((chunk) => chunk.path)).toEqual(
      expect.arrayContaining([
        "README.md",
        "AGENTS.md",
        "package.json",
        "tsconfig.json",
        "apps/web/src/middleware.ts",
        "apps/web/src/auth.ts",
        "apps/web/src/auth.test.ts"
      ])
    );
    expect(result.chunks.find((chunk) => chunk.path === "README.md")?.sourceType).toBe("docs");
    expect(result.chunks.find((chunk) => chunk.path === "AGENTS.md")?.sourceType).toBe(
      "agent_instructions"
    );
    expect(result.chunks.find((chunk) => chunk.path === "package.json")?.sourceType).toBe(
      "package"
    );
    expect(result.chunks.find((chunk) => chunk.path === "tsconfig.json")?.sourceType).toBe(
      "config"
    );
    expect(result.chunks.find((chunk) => chunk.path === "apps/web/src/auth.ts")?.sourceType).toBe(
      "source"
    );
    expect(result.chunks.find((chunk) => chunk.path.endsWith(".test.ts"))?.sourceType).toBe(
      "tests"
    );
  });

  it("excludes generated and dependency directories", () => {
    const workdir = mkdtempSync(join(tmpdir(), "signal-recycler-excluded-scan-"));
    writeFileSync(join(workdir, "README.md"), "indexed docs\n");
    for (const segment of [
      ".git",
      ".beads",
      ".signal-recycler",
      "node_modules",
      "dist",
      "build",
      "coverage",
      ".next",
      ".turbo",
      ".vite"
    ]) {
      mkdirSync(join(workdir, segment), { recursive: true });
      writeFileSync(join(workdir, segment, "ignored.md"), "This file must not be indexed.\n");
    }

    const result = scanContextIndex({
      projectId: "fixture",
      workdir,
      indexedAt: "2026-05-14T00:00:00.000Z"
    });

    expect(result.chunks.map((chunk) => chunk.path)).toEqual(["README.md"]);
  });

  it("records stable hashes, line ranges, file metadata, and slash-normalized paths", () => {
    const first = scanContextIndex({
      projectId: "fixture",
      workdir: fixtureRoot,
      indexedAt: "2026-05-14T00:00:00.000Z"
    });
    const second = scanContextIndex({
      projectId: "fixture",
      workdir: fixtureRoot,
      indexedAt: "2026-05-14T00:01:00.000Z"
    });
    const firstReadme = first.chunks.find((chunk) => chunk.path === "README.md");
    const secondReadme = second.chunks.find((chunk) => chunk.path === "README.md");

    expect(firstReadme).toMatchObject({
      projectId: "fixture",
      lineStart: 1,
      lineEnd: 5,
      indexedAt: "2026-05-14T00:00:00.000Z",
      mtimeMs: expect.any(Number),
      sizeBytes: expect.any(Number)
    });
    expect(firstReadme?.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(firstReadme?.hash).toBe(secondReadme?.hash);
    expect(first.chunks.every((chunk) => !chunk.path.includes("\\"))).toBe(true);
  });

  it("skips files larger than the max file byte limit", () => {
    const workdir = mkdtempSync(join(tmpdir(), "signal-recycler-large-scan-"));
    writeFileSync(join(workdir, "README.md"), "small docs\n");
    writeFileSync(join(workdir, "huge.ts"), "x".repeat(64));

    const result = scanContextIndex({
      projectId: "fixture",
      workdir,
      indexedAt: "2026-05-14T00:00:00.000Z",
      maxFileBytes: 32
    });

    expect(result.chunks.map((chunk) => chunk.path)).toEqual(["README.md"]);
  });

  it("skips binary-looking files", () => {
    const workdir = mkdtempSync(join(tmpdir(), "signal-recycler-binary-scan-"));
    mkdirSync(join(workdir, "src"));
    writeFileSync(join(workdir, "src", "safe.ts"), "export const safe = true;\n");
    writeFileSync(join(workdir, "src", "binary.ts"), Buffer.from([0x65, 0x78, 0x00, 0x70]));

    const result = scanContextIndex({
      projectId: "fixture",
      workdir,
      indexedAt: "2026-05-14T00:00:00.000Z"
    });

    expect(result.chunks.map((chunk) => chunk.path)).toEqual(["src/safe.ts"]);
  });
});
