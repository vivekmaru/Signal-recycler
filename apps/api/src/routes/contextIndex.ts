import { type FastifyInstance } from "fastify";
import { contextRetrievalRequestSchema, type ContextChunk } from "@signal-recycler/shared";
import { createContextIndexStore } from "../services/contextIndexStore.js";
import { retrieveContextChunks } from "../services/contextIndexRetrieval.js";
import { scanContextIndex } from "../services/contextIndexScanner.js";

export type ContextIndexRouteOptions = {
  contextIndexDbPath: string;
  projectId: string;
  workingDirectory: string;
};

export async function registerContextIndexRoutes(
  app: FastifyInstance,
  options: ContextIndexRouteOptions
): Promise<void> {
  const contextStore = createContextIndexStore(options.contextIndexDbPath);

  app.addHook("onClose", async () => {
    contextStore.close();
  });

  app.get("/api/context-index/status", async () =>
    contextStore.status(options.projectId, options.workingDirectory)
  );

  app.post("/api/context-index/reindex", async () => {
    const indexedAt = new Date().toISOString();
    const scanned = scanContextIndex({
      projectId: options.projectId,
      workdir: options.workingDirectory,
      indexedAt
    });

    contextStore.replaceProjectIndex({
      projectId: options.projectId,
      workdir: options.workingDirectory,
      replacedPaths: scanned.paths,
      chunks: scanned.chunks.map(stripProjectId)
    });

    return contextStore.status(options.projectId, options.workingDirectory);
  });

  app.post("/api/context-index/retrieve", async (request, reply) => {
    const parsed = contextRetrievalRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid context retrieval request",
        message: parsed.error.issues.map((issue) => issue.message).join("; ")
      });
    }

    return retrieveContextChunks({
      store: contextStore,
      projectId: options.projectId,
      query: parsed.data.prompt,
      limit: parsed.data.limit,
      ...(parsed.data.sourceTypes ? { sourceTypes: parsed.data.sourceTypes } : {})
    });
  });
}

function stripProjectId(chunk: Omit<ContextChunk, "id">): Omit<ContextChunk, "id" | "projectId"> {
  const { projectId: _projectId, ...rest } = chunk;
  return rest;
}
