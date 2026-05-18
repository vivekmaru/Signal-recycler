import { type FastifyInstance, type FastifyReply } from "fastify";
import { contextRetrievalRequestSchema, type ContextChunk } from "@signal-recycler/shared";
import { type ContextIndexStore } from "../services/contextIndexStore.js";
import { type LazyContextIndexStore } from "../services/contextIndexRuntime.js";
import { retrieveContextChunks } from "../services/contextIndexRetrieval.js";
import { scanContextIndex } from "../services/contextIndexScanner.js";

export type ContextIndexRouteOptions = {
  contextIndexStore: LazyContextIndexStore;
  projectId: string;
  workingDirectory: string;
};

export async function registerContextIndexRoutes(
  app: FastifyInstance,
  options: ContextIndexRouteOptions
): Promise<void> {
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

  app.get("/api/context-index/chunks/:chunkId", async (request, reply) => {
    const store = getContextStore();
    if (!store.ok) return sendUnavailable(reply, store.error);
    const { chunkId } = request.params as { chunkId?: string };
    if (!chunkId) {
      return reply.code(400).send({
        error: "Invalid context chunk request",
        message: "chunkId is required"
      });
    }

    const chunk = store.value.getChunk(options.projectId, chunkId);
    if (!chunk) {
      return reply.code(404).send({
        error: "Context chunk not found",
        message: "No indexed context chunk matched this id for the current project."
      });
    }

    return chunk;
  });

  function getContextStore(): { ok: true; value: ContextIndexStore } | { ok: false; error: Error } {
    return options.contextIndexStore.get();
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
