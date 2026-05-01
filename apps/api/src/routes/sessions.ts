import path from "node:path";
import { type FastifyInstance } from "fastify";
import { createSessionRequestSchema, runRequestSchema } from "@signal-recycler/shared";
import { processTurn } from "../services/turnProcessor.js";
import { type SignalRecyclerStore } from "../store.js";
import { type CodexRunner } from "../types.js";

export type RouteOptions = {
  store: SignalRecyclerStore;
  codexRunner: CodexRunner;
  projectId: string;
  workingDirectory: string;
  upstreamBaseUrl?: string;
};

export async function registerSessionRoutes(
  app: FastifyInstance,
  options: RouteOptions
): Promise<void> {
  const { projectId, workingDirectory } = options;

  app.post("/api/sessions", async (request) => {
    const parsed = createSessionRequestSchema.parse(request.body ?? {});
    return options.store.createSession({
      projectId,
      title: parsed.title ?? `Signal Recycler — ${path.basename(workingDirectory)}`
    });
  });

  app.get("/api/sessions", async () => options.store.listSessions());

  app.get("/api/firehose/events", async (request) => {
    const { limit: rawLimit } = request.query as { limit?: string };
    const limit = Number(rawLimit ?? 100);
    return options.store.listAllEvents(Number.isFinite(limit) ? limit : 100);
  });

  app.post("/api/sessions/:id/run", async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = options.store.getSession(id);
    if (!session) return reply.code(404).send({ error: "Session not found" });

    const parsed = runRequestSchema.parse(request.body);
    options.store.createEvent({
      sessionId: id,
      category: "codex_event",
      title: "User prompt",
      body: parsed.prompt,
      metadata: { phase: "input" }
    });

    try {
      return await processTurn({
        store: options.store,
        codexRunner: options.codexRunner,
        projectId,
        sessionId: id,
        prompt: parsed.prompt
      });
    } catch (error) {
      const message = (error as Error).message;
      options.store.createEvent({
        sessionId: id,
        category: "codex_event",
        title: "Codex run failed",
        body: message,
        metadata: { phase: "codex_error" }
      });
      request.log.error({ err: error }, "Codex run failed");
      return reply.code(502).send({ error: "Codex run failed", message });
    }
  });

  app.get("/api/sessions/:id/events", async (request, reply) => {
    const { id } = request.params as { id: string };
    const events = options.store.listEvents(id);
    if (request.headers.accept?.includes("text/event-stream")) {
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      });
      for (const event of events) {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      }
      reply.raw.end();
      return reply;
    }
    return events;
  });
}
