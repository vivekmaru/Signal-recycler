import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import { type ContextChunk, type ContextSourceType } from "@signal-recycler/shared";

export type ContextIndexChunk = Omit<ContextChunk, "id">;
export type ContextIndexScanError = {
  path: string;
  reason: "read_directory_failed" | "read_file_failed";
  message: string;
};

type ScanContextIndexInput = {
  projectId: string;
  workdir: string;
  indexedAt: string;
  maxFileBytes?: number;
};

const DEFAULT_MAX_FILE_BYTES = 120_000;
const MAX_LINES_PER_CHUNK = 80;

const EXCLUDED_SEGMENTS = new Set([
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
]);

const TEXT_EXTENSIONS = new Set([
  ".css",
  ".cjs",
  ".html",
  ".js",
  ".json",
  ".jsonc",
  ".jsx",
  ".md",
  ".mdx",
  ".mjs",
  ".scss",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml"
]);

const CONFIG_BASENAMES = new Set([
  ".env.example",
  ".gitignore",
  "biome.json",
  "eslint.config.js",
  "prettier.config.js",
  "tsconfig.json",
  "vite.config.js",
  "vitest.config.ts"
]);

export function scanContextIndex(input: ScanContextIndexInput): {
  chunks: ContextIndexChunk[];
  paths: string[];
  errors: ContextIndexScanError[];
} {
  const chunks: ContextIndexChunk[] = [];
  const paths: string[] = [];
  const errors: ContextIndexScanError[] = [];
  const maxFileBytes = input.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const walked = walkFiles(input.workdir, input.workdir);
  errors.push(...walked.errors);

  for (const absolutePath of walked.files) {
    const path = normalizePath(relative(input.workdir, absolutePath));
    if (!shouldIndexPath(path)) continue;

    const file = readIndexableFile(absolutePath, maxFileBytes);
    if (file.status === "skip") continue;
    if (file.status === "error") {
      errors.push({
        path,
        reason: "read_file_failed",
        message: file.message
      });
      continue;
    }

    paths.push(path);
    chunks.push(
      ...chunkFile({
        projectId: input.projectId,
        sourceType: classifySourceType(path),
        path,
        text: file.text,
        mtimeMs: file.mtimeMs,
        sizeBytes: file.sizeBytes,
        indexedAt: input.indexedAt
      })
    );
  }

  return { chunks, paths, errors };
}

function walkFiles(
  root: string,
  base: string
): { files: string[]; errors: ContextIndexScanError[] } {
  const files: string[] = [];
  const errors: ContextIndexScanError[] = [];
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name)
    );
  } catch (error) {
    return {
      files,
      errors: [
        {
          path: normalizePath(relative(base, root)) || ".",
          reason: "read_directory_failed",
          message: errorMessage(error)
        }
      ]
    };
  }

  for (const entry of entries) {
    if (EXCLUDED_SEGMENTS.has(entry.name)) continue;

    const absolutePath = join(root, entry.name);
    if (entry.isDirectory()) {
      const walked = walkFiles(absolutePath, base);
      files.push(...walked.files);
      errors.push(...walked.errors);
    } else if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return { files, errors };
}

function readIndexableFile(
  absolutePath: string,
  maxFileBytes: number
):
  | { status: "ok"; text: string; mtimeMs: number; sizeBytes: number }
  | { status: "skip" }
  | { status: "error"; message: string } {
  try {
    const stats = statSync(absolutePath);
    if (stats.size > maxFileBytes) return { status: "skip" };
    const bytes = readFileSync(absolutePath);
    if (looksBinary(bytes)) return { status: "skip" };
    return {
      status: "ok",
      text: bytes.toString("utf8"),
      mtimeMs: stats.mtimeMs,
      sizeBytes: stats.size
    };
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
}

function shouldIndexPath(path: string): boolean {
  if (isAgentInstructions(path)) return true;
  if (CONFIG_BASENAMES.has(basename(path))) return true;
  return TEXT_EXTENSIONS.has(extname(path));
}

function classifySourceType(path: string): ContextSourceType {
  const name = basename(path);

  if (isAgentInstructions(path)) return "agent_instructions";
  if (name === "package.json" || name === "pnpm-workspace.yaml") return "package";
  if (isTestPath(path)) return "tests";
  if (path.startsWith("docs/") || path.endsWith(".md") || path.endsWith(".mdx")) return "docs";
  if (CONFIG_BASENAMES.has(name) || /\.(jsonc?|ya?ml|toml)$/.test(path)) return "config";
  return "source";
}

function chunkFile(input: {
  projectId: string;
  sourceType: ContextSourceType;
  path: string;
  text: string;
  mtimeMs: number;
  sizeBytes: number;
  indexedAt: string;
}): ContextIndexChunk[] {
  const lines = splitLines(input.text);
  const chunks: ContextIndexChunk[] = [];

  for (let start = 0; start < lines.length; start += MAX_LINES_PER_CHUNK) {
    const selected = lines.slice(start, start + MAX_LINES_PER_CHUNK);
    const text = selected.join("");
    if (text.trim().length === 0) continue;

    chunks.push({
      projectId: input.projectId,
      sourceType: input.sourceType,
      path: input.path,
      lineStart: start + 1,
      lineEnd: start + selected.length,
      hash: chunkHash(input.path, start + 1, text),
      mtimeMs: input.mtimeMs,
      sizeBytes: input.sizeBytes,
      text,
      indexedAt: input.indexedAt
    });
  }

  return chunks;
}

function splitLines(text: string): string[] {
  const lines = text.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) ?? [];
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function chunkHash(path: string, lineStart: number, text: string): string {
  return createHash("sha256").update(`${path}:${lineStart}:${text}`).digest("hex");
}

function looksBinary(bytes: Buffer): boolean {
  return bytes.includes(0);
}

function isAgentInstructions(path: string): boolean {
  const name = basename(path);
  return name === "AGENTS.md" || name === "CLAUDE.md";
}

function isTestPath(path: string): boolean {
  return /(?:^|\/)(?:test|tests|__tests__)\//.test(path) || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path);
}

function basename(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function normalizePath(value: string): string {
  return value.split(sep).join("/");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
