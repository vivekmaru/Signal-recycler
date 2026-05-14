import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import { type ContextChunk, type ContextSourceType } from "@signal-recycler/shared";

export type ContextIndexChunk = Omit<ContextChunk, "id">;

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

export function scanContextIndex(input: ScanContextIndexInput): { chunks: ContextIndexChunk[] } {
  const chunks: ContextIndexChunk[] = [];
  const maxFileBytes = input.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;

  for (const absolutePath of walkFiles(input.workdir)) {
    const path = normalizePath(relative(input.workdir, absolutePath));
    if (!shouldIndexPath(path)) continue;

    const stats = statSync(absolutePath);
    if (stats.size > maxFileBytes) continue;

    const bytes = readFileSync(absolutePath);
    if (looksBinary(bytes)) continue;

    const text = bytes.toString("utf8");
    chunks.push(
      ...chunkFile({
        projectId: input.projectId,
        sourceType: classifySourceType(path),
        path,
        text,
        mtimeMs: stats.mtimeMs,
        sizeBytes: stats.size,
        indexedAt: input.indexedAt
      })
    );
  }

  return { chunks };
}

function walkFiles(root: string): string[] {
  if (!existsSync(root)) return [];

  const files: string[] = [];
  const entries = readdirSync(root, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name)
  );

  for (const entry of entries) {
    if (EXCLUDED_SEGMENTS.has(entry.name)) continue;

    const absolutePath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(absolutePath));
    } else if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
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
    const text = selected.join("\n").trim();
    if (!text) continue;

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
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return normalized.endsWith("\n") ? normalized.slice(0, -1).split("\n") : normalized.split("\n");
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
