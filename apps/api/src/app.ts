import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import {
  createSessionRequestSchema,
  runRequestSchema
} from "@signal-recycler/shared";
import { classifyTurn } from "./classifier.js";
import { injectIntoRequestBody } from "./playbook.js";
import { type SignalRecyclerStore } from "./store.js";

export type CodexRunner = {
  run(input: { sessionId: string; prompt: string }): Promise<{
    finalResponse: string;
    items: unknown[];
  }>;
};

type AppOptions = {
  store: SignalRecyclerStore;
  codexRunner: CodexRunner;
  upstreamBaseUrl?: string;
};

export async function createApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env.SIGNAL_RECYCLER_LOG_LEVEL
      ? { level: process.env.SIGNAL_RECYCLER_LOG_LEVEL }
      : false
  });
  const projectId = "demo-repo";

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

  await app.register(cors, {
    origin: true
  });

  app.addHook("onRequest", async (request) => {
    if (!request.url.startsWith("/proxy/")) return;
    for (const key of REQUEST_ENTITY_HEADERS_TO_DROP_BEFORE_PARSE) {
      delete request.raw.headers[key];
    }
  });

  app.get("/health", async () => ({ ok: true }));

  app.post("/api/sessions", async (request) => {
    const parsed = createSessionRequestSchema.parse(request.body ?? {});
    return options.store.createSession({
      projectId,
      title: parsed.title ?? "Signal Recycler demo"
    });
  });

  app.get("/api/sessions", async () => options.store.listSessions());

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

    let turn: Awaited<ReturnType<CodexRunner["run"]>>;
    try {
      turn = await options.codexRunner.run({ sessionId: id, prompt: parsed.prompt });
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
      return reply.code(502).send({
        error: "Codex run failed",
        message
      });
    }
    const codexEvent = options.store.createEvent({
      sessionId: id,
      category: "codex_event",
      title: "Codex response",
      body: turn.finalResponse,
      metadata: { items: turn.items.length }
    });

    const classification = await classifyTurn({
      prompt: parsed.prompt,
      finalResponse: turn.finalResponse,
      items: turn.items
    });
    options.store.createEvent({
      sessionId: id,
      category: "classifier_result",
      title: "Mark and distill complete",
      body: `${classification.signal.length} signal, ${classification.noise.length} noise, ${classification.failure.length} failure`,
      metadata: classification
    });

    const candidateRules = classification.candidateRules.map((candidate) => {
      const rule = options.store.createRuleCandidate({
        projectId,
        category: candidate.category,
        rule: candidate.rule,
        reason: candidate.reason,
        sourceEventId: codexEvent.id
      });
      options.store.createEvent({
        sessionId: id,
        category: "rule_candidate",
        title: "Rule candidate created",
        body: candidate.rule,
        metadata: { ruleId: rule.id, reason: candidate.reason, category: candidate.category }
      });
      return rule;
    });

    return { finalResponse: turn.finalResponse, candidateRules };
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

  app.get("/api/rules", async () => options.store.listRules(projectId));

  app.post("/api/rules/:id/approve", async (request) => {
    const { id } = request.params as { id: string };
    return options.store.approveRule(id);
  });

  app.post("/api/rules/:id/reject", async (request) => {
    const { id } = request.params as { id: string };
    return options.store.rejectRule(id);
  });

  app.get("/api/playbook/export", async (_request, reply) => {
    return reply.type("text/markdown").send(options.store.exportPlaybook(projectId));
  });

  app.all("/proxy/*", async (request, reply) => {
    const rules = options.store.listApprovedRules(projectId);
    const tail = request.url.replace(/^\/proxy/, "");
    const upstreamBaseUrl =
      options.upstreamBaseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com";
    const upstreamUrl = `${upstreamBaseUrl.replace(/\/$/, "")}${tail}`;
    const body = request.body ? injectProxyBody(request.body, rules) : undefined;

    options.store.createEvent({
      sessionId: request.headers["x-signal-recycler-session-id"]?.toString() ?? "proxy",
      category: "proxy_request",
      title: "Proxy request",
      body: `${request.method} ${tail}`,
      metadata: { injectedRules: rules.length }
    });
    if (rules.length > 0) {
      options.store.createEvent({
        sessionId: request.headers["x-signal-recycler-session-id"]?.toString() ?? "proxy",
        category: "proxy_injection",
        title: "Playbook injected",
        body: `${rules.length} approved rule(s) prepended to the request.`,
        metadata: { ruleIds: rules.map((rule) => rule.id) }
      });
    }

    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (!value || shouldDropRequestHeader(key)) continue;
      headers.set(key, Array.isArray(value) ? value.join(",") : String(value));
    }
    if (process.env.OPENAI_API_KEY && !headers.has("authorization")) {
      headers.set("authorization", `Bearer ${process.env.OPENAI_API_KEY}`);
    }
    if (body !== undefined) {
      headers.set(
        "content-type",
        typeof body === "string" ? "application/json" : "application/json"
      );
    }

    const fetchInit: RequestInit = {
      method: request.method,
      headers
    };
    if (body !== undefined) {
      fetchInit.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    const upstream = await fetch(upstreamUrl, fetchInit);

    reply.code(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (!shouldDropResponseHeader(key)) {
        reply.header(key, value);
      }
    });
    return reply.send(upstream.body);
  });

  return app;
}

function injectProxyBody(body: unknown, rules: ReturnType<SignalRecyclerStore["listApprovedRules"]>): unknown {
  if (typeof body === "string") {
    try {
      return injectIntoRequestBody(JSON.parse(body), rules);
    } catch {
      return body;
    }
  }
  return injectIntoRequestBody(body, rules);
}

function shouldDropRequestHeader(key: string): boolean {
  return REQUEST_HEADERS_TO_DROP_UPSTREAM.includes(key.toLowerCase());
}

function shouldDropResponseHeader(key: string): boolean {
  return [
    "connection",
    "content-length",
    "content-encoding",
    "transfer-encoding"
  ].includes(key.toLowerCase());
}

const REQUEST_ENTITY_HEADERS_TO_DROP_BEFORE_PARSE = [
  "content-length",
  "content-encoding",
  "transfer-encoding"
];

const REQUEST_HEADERS_TO_DROP_UPSTREAM = [
  "host",
  "connection",
  "upgrade",
  "keep-alive",
  "proxy-connection",
  ...REQUEST_ENTITY_HEADERS_TO_DROP_BEFORE_PARSE,
  "accept-encoding"
];
