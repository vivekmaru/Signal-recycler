import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  type ContextChunk,
  type ContextIndexStatus,
  type ContextSourceType
} from "@signal-recycler/shared";

type IndexableContextChunk = Omit<ContextChunk, "id" | "projectId">;

type UpsertChunksInput = {
  projectId: string;
  workdir: string;
  chunks: IndexableContextChunk[];
  replacedPaths?: string[];
};

type ReplaceProjectIndexInput = UpsertChunksInput;

type SearchInput = {
  projectId: string;
  query: string;
  limit: number;
  sourceTypes?: ContextSourceType[] | undefined;
};

type SearchHit = {
  chunk: ContextChunk;
  rank: number;
  score: number;
};

type ChunkIdRecord = {
  id: string;
  sourceType: ContextSourceType;
};

export type ContextIndexStore = ReturnType<typeof createContextIndexStore>;

export function createContextIndexStore(path: string) {
  const db = new DatabaseSync(path);
  ensureSchema(db);

  return {
    upsertChunks(input: UpsertChunksInput): void {
      db.exec("BEGIN");
      try {
        for (const path of uniquePaths(input.chunks, input.replacedPaths)) {
          deleteProjectPathChunks(db, input.projectId, path);
        }
        for (const chunk of input.chunks) {
          upsertChunk(db, input.projectId, chunk);
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },

    replaceProjectIndex(input: ReplaceProjectIndexInput): void {
      db.exec("BEGIN");
      try {
        db.prepare("DELETE FROM context_chunk_fts WHERE project_id = ?").run(input.projectId);
        db.prepare("DELETE FROM context_chunks WHERE project_id = ?").run(input.projectId);
        for (const chunk of input.chunks) {
          upsertChunk(db, input.projectId, chunk);
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },

    status(projectId: string, workdir: string): ContextIndexStatus {
      const totalRow = db
        .prepare(
          `SELECT COUNT(*) AS chunks,
                  COUNT(DISTINCT path) AS files,
                  MAX(indexed_at) AS last_indexed_at
           FROM context_chunks
           WHERE project_id = ?`
        )
        .get(projectId) as { chunks: number; files: number; last_indexed_at: string | null };
      const bySourceType = db
        .prepare(
          `SELECT source_type,
                  COUNT(DISTINCT path) AS files,
                  COUNT(*) AS chunks
           FROM context_chunks
           WHERE project_id = ?
           GROUP BY source_type
           ORDER BY ${sourceTypeOrderSql("source_type")}, source_type ASC`
        )
        .all(projectId)
        .map((row) => {
          const typedRow = row as { source_type: string; files: number; chunks: number };
          return {
            sourceType: typedRow.source_type as ContextSourceType,
            files: Number(typedRow.files),
            chunks: Number(typedRow.chunks)
          };
        });

      return {
        projectId,
        workdir,
        totalChunks: Number(totalRow.chunks),
        totalFiles: Number(totalRow.files),
        lastIndexedAt: totalRow.last_indexed_at,
        bySourceType
      };
    },

    search(input: SearchInput): SearchHit[] {
      const terms = tokenizeSearchQuery(input.query);
      const limit = Math.floor(input.limit);
      if (terms.length === 0 || limit <= 0) return [];

      const sourceTypes = normalizeSourceTypes(input.sourceTypes);
      const sourceFilter =
        sourceTypes.length > 0
          ? `AND context_chunks.source_type IN (${sourceTypes.map(() => "?").join(", ")})`
          : "";
      const rows = db
        .prepare(
          `SELECT context_chunks.*,
                  bm25(context_chunk_fts, 0.0, 0.0, 2.0, 6.0) AS search_score
           FROM context_chunk_fts
           JOIN context_chunks ON context_chunks.id = context_chunk_fts.chunk_id
           WHERE context_chunk_fts MATCH ?
             AND context_chunk_fts.project_id = ?
             AND context_chunks.project_id = ?
             ${sourceFilter}
           ORDER BY search_score ASC,
                    ${sourceTypeOrderSql("context_chunks.source_type")},
                    context_chunks.path ASC,
                    context_chunks.line_start ASC
           LIMIT ?`
        )
        .all(
          terms.map((term) => `"${term}"`).join(" OR "),
          input.projectId,
          input.projectId,
          ...sourceTypes,
          limit
        ) as Array<Record<string, unknown> & { search_score: number }>;

      return rows.map((row, index) => ({
        chunk: mapChunk(row),
        rank: index + 1,
        score: Math.max(0, -Number(row.search_score))
      }));
    },

    listChunkIds(projectId: string, sourceTypes?: ContextSourceType[]): ChunkIdRecord[] {
      const normalizedSourceTypes = normalizeSourceTypes(sourceTypes);
      const sourceFilter =
        normalizedSourceTypes.length > 0
          ? `AND source_type IN (${normalizedSourceTypes.map(() => "?").join(", ")})`
          : "";
      return db
        .prepare(
          `SELECT id, source_type
           FROM context_chunks
           WHERE project_id = ?
             ${sourceFilter}
           ORDER BY ${sourceTypeOrderSql("source_type")}, path ASC, line_start ASC`
        )
        .all(projectId, ...normalizedSourceTypes)
        .map((row) => {
          const typedRow = row as { id: string; source_type: string };
          return {
            id: typedRow.id,
            sourceType: typedRow.source_type as ContextSourceType
          };
        });
    },

    close(): void {
      db.close();
    }
  };
}

function ensureSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS context_chunks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      path TEXT NOT NULL,
      line_start INTEGER NOT NULL,
      line_end INTEGER NOT NULL,
      hash TEXT NOT NULL,
      mtime_ms REAL NOT NULL,
      size_bytes INTEGER NOT NULL,
      text TEXT NOT NULL,
      indexed_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_context_chunks_project_path_hash
      ON context_chunks (project_id, path, hash);

    CREATE INDEX IF NOT EXISTS idx_context_chunks_project_source
      ON context_chunks (project_id, source_type, path);

    CREATE VIRTUAL TABLE IF NOT EXISTS context_chunk_fts USING fts5(
      chunk_id UNINDEXED,
      project_id UNINDEXED,
      path,
      text,
      tokenize = 'porter unicode61'
    );
  `);
}

function upsertChunk(db: DatabaseSync, projectId: string, chunk: IndexableContextChunk): void {
  const id = contextChunkId(projectId, chunk.path, chunk.hash);
  db.prepare("DELETE FROM context_chunk_fts WHERE chunk_id = ?").run(id);
  db.prepare("DELETE FROM context_chunks WHERE id = ?").run(id);
  db.prepare(
    `INSERT INTO context_chunks (
      id, project_id, source_type, path, line_start, line_end, hash,
      mtime_ms, size_bytes, text, indexed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    projectId,
    chunk.sourceType,
    chunk.path,
    chunk.lineStart,
    chunk.lineEnd,
    chunk.hash,
    chunk.mtimeMs,
    chunk.sizeBytes,
    chunk.text,
    chunk.indexedAt
  );
  db.prepare(
    `INSERT INTO context_chunk_fts (chunk_id, project_id, path, text)
     VALUES (?, ?, ?, ?)`
  ).run(id, projectId, chunk.path, chunk.text);
}

function deleteProjectPathChunks(db: DatabaseSync, projectId: string, path: string): void {
  db.prepare(
    `DELETE FROM context_chunk_fts
     WHERE chunk_id IN (
       SELECT id FROM context_chunks WHERE project_id = ? AND path = ?
     )`
  ).run(projectId, path);
  db.prepare("DELETE FROM context_chunks WHERE project_id = ? AND path = ?").run(projectId, path);
}

function uniquePaths(chunks: IndexableContextChunk[], replacedPaths: string[] = []): string[] {
  return Array.from(new Set([...replacedPaths, ...chunks.map((chunk) => chunk.path)]));
}

function mapChunk(row: Record<string, unknown>): ContextChunk {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    sourceType: String(row.source_type) as ContextSourceType,
    path: String(row.path),
    lineStart: Number(row.line_start),
    lineEnd: Number(row.line_end),
    hash: String(row.hash),
    mtimeMs: Number(row.mtime_ms),
    sizeBytes: Number(row.size_bytes),
    text: String(row.text),
    indexedAt: String(row.indexed_at)
  };
}

function contextChunkId(projectId: string, path: string, hash: string): string {
  return `ctx_${createHash("sha256")
    .update(`${projectId}:${path}:${hash}`)
    .digest("hex")
    .slice(0, 32)}`;
}

const SOURCE_TYPE_ORDER: ContextSourceType[] = [
  "docs",
  "agent_instructions",
  "package",
  "source",
  "config",
  "tests"
];

function sourceTypeOrderSql(column: string): string {
  return `CASE ${column}
    WHEN 'docs' THEN 0
    WHEN 'agent_instructions' THEN 1
    WHEN 'package' THEN 2
    WHEN 'source' THEN 3
    WHEN 'config' THEN 4
    WHEN 'tests' THEN 5
    ELSE 6
  END`;
}

function normalizeSourceTypes(sourceTypes: ContextSourceType[] | undefined): ContextSourceType[] {
  if (!sourceTypes) return [];
  const allowed = new Set(SOURCE_TYPE_ORDER);
  const seen = new Set<ContextSourceType>();
  const normalized: ContextSourceType[] = [];
  for (const sourceType of sourceTypes) {
    if (!allowed.has(sourceType) || seen.has(sourceType)) continue;
    seen.add(sourceType);
    normalized.push(sourceType);
  }
  return normalized;
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
  "do",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "to",
  "we",
  "with"
]);

function tokenizeSearchQuery(query: string): string[] {
  const seen = new Set<string>();
  const matches = query.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const terms: string[] = [];
  for (const match of matches) {
    if (match.length < 3 || match.length > 48) continue;
    if (SEARCH_STOP_WORDS.has(match)) continue;
    if (seen.has(match)) continue;
    seen.add(match);
    terms.push(match);
    if (terms.length >= 8) break;
  }
  return terms;
}
