import path from "node:path";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { registerDemoRoutes } from "./routes/demo.js";
import {
  registerProxyRoutes,
  REQUEST_ENTITY_HEADERS_TO_DROP_BEFORE_PARSE
} from "./routes/proxy.js";
import { registerRuleRoutes } from "./routes/rules.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { type createAgentAdapterRegistry } from "./services/agentAdapters.js";
import { type SignalRecyclerStore } from "./store.js";
import { type CodexRunner } from "./types.js";

type AppOptions = {
  store: SignalRecyclerStore;
  codexRunner: CodexRunner;
  projectId: string;
  workingDirectory: string;
  databasePath?: string;
  upstreamBaseUrl?: string;
  agentAdapterRegistry?: ReturnType<typeof createAgentAdapterRegistry>;
};

export async function createApp(options: AppOptions): Promise<FastifyInstance> {
  const { projectId, workingDirectory } = options;

  const app = Fastify({
    logger: process.env.SIGNAL_RECYCLER_LOG_LEVEL
      ? { level: process.env.SIGNAL_RECYCLER_LOG_LEVEL }
      : false
  });

  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
    try {
      const text = body.toString();
      if (request.url.startsWith("/proxy/")) {
        if (text.length === 0) {
          done(null, undefined);
          return;
        }
        try {
          done(null, JSON.parse(text));
        } catch {
          done(null, text);
        }
        return;
      }
      done(null, text.length === 0 ? {} : JSON.parse(text));
    } catch (error) {
      done(error as Error);
    }
  });

  await app.register(cors, { origin: true });

  app.addHook("onRequest", async (request) => {
    if (!request.url.startsWith("/proxy/")) return;
    for (const key of REQUEST_ENTITY_HEADERS_TO_DROP_BEFORE_PARSE) {
      delete request.raw.headers[key];
    }
  });

  app.get("/health", async () => ({ ok: true }));

  app.get("/api/config", async () => {
    const databasePath = options.databasePath ?? "";
    return {
      projectId,
      workingDirectory,
      workingDirectoryBasename: path.basename(workingDirectory),
      database: {
        basename: databasePath ? path.basename(databasePath) : null,
        isSmoke: databasePath.includes("smoke")
      }
    };
  });

  await registerSessionRoutes(app, options);
  await registerDemoRoutes(app, options);
  await registerRuleRoutes(app, options);
  await registerProxyRoutes(app, options);

  return app;
}
