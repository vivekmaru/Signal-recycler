import { type FastifyInstance, type FastifyReply } from "fastify";
import { contextRetrievalRequestSchema, type ContextChunk } from "@signal-recycler/shared";
import {
  createContextIndexStore,
  type ContextIndexStore
} from "../services/contextIndexStore.js";
import { retrieveContextChunks } from "../services/contextIndexRetrieval.js";
import { scanContextIndex } from "../services/contextIndexScanner.js";

export type ContextIndexRouteOptions = {
  contextIndexDbPath: string;
  contextIndexStoreFactory?: (path: string) => ContextIndexStore;
  projectId: string;
  workingDirectory: string;
};

export async function registerContextIndexRoutes(
  app: FastifyInstance,
  options: ContextIndexRouteOptions
): Promise<void> {
  const createStore = options.contextIndexStoreFactory ?? createContextIndexStore;
  let contextStore: ContextIndexStore | null = null;

  app.addHook("onClose", async () => {
    contextStore?.close();
  });

  app.get("/api/context-index/status", async (_request, reply) => {
    const store = getContextStore();
    if (!store.ok) return sendUnavailable(reply, store.error);
    return store.value.status(options.projectId, options.workingDirectory);
  });

  app.post("/api/context-index/reindex", async (_request, reply) => {
    const store = getContextStore();
    if (!store.ok) return sendUnavailable(reply, store.error);
    const indexedAt = new Date().toISOString();
    const scanned = scanContextIndex({
      projectId: options.projectId,
      workdir: options.workingDirectory,
      indexedAt
    });
    if (scanned.errors.length > 0) {
      return reply.code(422).send({
        error: "Context index scan failed",
        message:
          "One or more files or directories could not be read, so the existing index was preserved.",
        errors: scanned.errors
      });
    }

    store.value.replaceProjectIndex({
      projectId: options.projectId,
      workdir: options.workingDirectory,
      replacedPaths: scanned.paths,
      chunks: scanned.chunks.map(stripProjectId)
    });

    return store.value.status(options.projectId, options.workingDirectory);
  });

  app.post("/api/context-index/retrieve", async (request, reply) => {
    const store = getContextStore();
    if (!store.ok) return sendUnavailable(reply, store.error);
    const parsed = contextRetrievalRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid context retrieval request",
        message: parsed.error.issues.map((issue) => issue.message).join("; ")
      });
    }

    return retrieveContextChunks({
      store: store.value,
      projectId: options.projectId,
      query: parsed.data.prompt,
      limit: parsed.data.limit,
      ...(parsed.data.sourceTypes ? { sourceTypes: parsed.data.sourceTypes } : {})
    });
  });

  function getContextStore(): { ok: true; value: ContextIndexStore } | { ok: false; error: Error } {
    if (contextStore) return { ok: true, value: contextStore };
    try {
      contextStore = createStore(options.contextIndexDbPath);
      return { ok: true, value: contextStore };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }
}

function stripProjectId(chunk: Omit<ContextChunk, "id">): Omit<ContextChunk, "id" | "projectId"> {
  const { projectId: _projectId, ...rest } = chunk;
  return rest;
}

function sendUnavailable(reply: FastifyReply, error: Error) {
  return reply.code(503).send({
    error: "Context index unavailable",
    message: error.message
  });
}
