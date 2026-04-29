import fs from "node:fs";
import path from "node:path";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import {
  createSessionRequestSchema,
  runRequestSchema
} from "@signal-recycler/shared";
import { classifyTurn } from "./classifier.js";
import { compressRequestBody } from "./compressor.js";
import { injectIntoRequestBody } from "./playbook.js";
import { type SignalRecyclerStore } from "./store.js";

export type CodexRunner = {
  run(input: { sessionId: string; prompt: string; workingDirectory?: string }): Promise<{
    finalResponse: string;
    items: unknown[];
  }>;
};

type AppOptions = {
  store: SignalRecyclerStore;
  codexRunner: CodexRunner;
  projectId: string;
  workingDirectory: string;
  upstreamBaseUrl?: string;
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

  app.get("/api/config", async () => ({
    projectId,
    workingDirectory,
    workingDirectoryBasename: path.basename(workingDirectory)
  }));

  app.post("/api/sessions", async (request) => {
    const parsed = createSessionRequestSchema.parse(request.body ?? {});
    return options.store.createSession({
      projectId,
      title: parsed.title ?? `Signal Recycler — ${path.basename(workingDirectory)}`
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
      return reply.code(502).send({ error: "Codex run failed", message });
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
      let rule = options.store.createRuleCandidate({
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
        metadata: {
          ruleId: rule.id,
          reason: candidate.reason,
          category: candidate.category,
          confidence: candidate.confidence
        }
      });
      // Auto-approve high-confidence rules — they're either pattern-extracted
      // or explicitly marked unambiguous by the LLM classifier.
      if (candidate.confidence === "high") {
        rule = options.store.approveRule(rule.id);
        options.store.createEvent({
          sessionId: id,
          category: "rule_auto_approved",
          title: "Rule auto-approved",
          body: candidate.rule,
          metadata: {
            ruleId: rule.id,
            confidence: candidate.confidence,
            category: candidate.category
          }
        });
      }
      return rule;
    });

    return { finalResponse: turn.finalResponse, candidateRules };
  });

  app.post("/api/demo/run", async (request, reply) => {
    // Orchestrated end-to-end demo. We always run against the bundled
    // fixtures/demo-repo because it contains a deterministic failure path
    // (a `test` script that rejects npm-driven execution), making the
    // before/after comparison reliable regardless of the user's main WORKDIR.
    const fixtureDir = findFixtureDir(workingDirectory);
    if (!fixtureDir) {
      return reply.code(500).send({
        error: "Demo fixture not found",
        message:
          "Expected fixtures/demo-repo at the repo root. The demo button needs the bundled fixture to demonstrate a deterministic teach→use arc."
      });
    }

    const teachPrompt =
      "Validate this project by running `npm test`. Report exactly what happens, including any error messages, and explain the correction needed if it fails.";
    const usePrompt =
      "Validate this project by running its test suite. Before running anything, follow any injected playbook rules.";

    const teachSession = options.store.createSession({
      projectId,
      title: `Demo phase 1 — ${path.basename(fixtureDir)}`
    });
    const phase1Start = Date.now();
    let phase1: Awaited<ReturnType<CodexRunner["run"]>>;
    try {
      phase1 = await options.codexRunner.run({
        sessionId: teachSession.id,
        prompt: teachPrompt,
        workingDirectory: fixtureDir
      });
    } catch (error) {
      return reply.code(502).send({ error: "Demo phase 1 failed", message: (error as Error).message });
    }
    const phase1Duration = Date.now() - phase1Start;
    const phase1Event = options.store.createEvent({
      sessionId: teachSession.id,
      category: "codex_event",
      title: "Phase 1 (teach) — Codex response",
      body: phase1.finalResponse,
      metadata: { items: phase1.items.length, phase: "teach" }
    });
    const phase1Classification = await classifyTurn({
      prompt: teachPrompt,
      finalResponse: phase1.finalResponse,
      items: phase1.items
    });
    options.store.createEvent({
      sessionId: teachSession.id,
      category: "classifier_result",
      title: "Phase 1 — distillation complete",
      body: `${phase1Classification.signal.length} signal, ${phase1Classification.noise.length} noise, ${phase1Classification.failure.length} failure`,
      metadata: phase1Classification
    });

    for (const candidate of phase1Classification.candidateRules) {
      let rule = options.store.createRuleCandidate({
        projectId,
        category: candidate.category,
        rule: candidate.rule,
        reason: candidate.reason,
        sourceEventId: phase1Event.id
      });
      // For the demo orchestrator, force-approve every candidate so the
      // impact comparison is deterministic — judges shouldn't have to click.
      if (rule.status !== "approved") {
        rule = options.store.approveRule(rule.id);
      }
      options.store.createEvent({
        sessionId: teachSession.id,
        category: "rule_auto_approved",
        title: "Rule auto-approved (demo)",
        body: candidate.rule,
        metadata: {
          ruleId: rule.id,
          confidence: candidate.confidence,
          category: candidate.category
        }
      });
    }

    const useSession = options.store.createSession({
      projectId,
      title: `Demo phase 2 — ${path.basename(fixtureDir)}`
    });
    const phase2Start = Date.now();
    let phase2: Awaited<ReturnType<CodexRunner["run"]>>;
    try {
      phase2 = await options.codexRunner.run({
        sessionId: useSession.id,
        prompt: usePrompt,
        workingDirectory: fixtureDir
      });
    } catch (error) {
      return reply.code(502).send({ error: "Demo phase 2 failed", message: (error as Error).message });
    }
    const phase2Duration = Date.now() - phase2Start;
    options.store.createEvent({
      sessionId: useSession.id,
      category: "codex_event",
      title: "Phase 2 (use) — Codex response",
      body: phase2.finalResponse,
      metadata: { items: phase2.items.length, phase: "use" }
    });

    return {
      phase1: {
        sessionId: teachSession.id,
        prompt: teachPrompt,
        finalResponse: phase1.finalResponse,
        items: phase1.items.length,
        durationMs: phase1Duration,
        rulesCreated: phase1Classification.candidateRules.length
      },
      phase2: {
        sessionId: useSession.id,
        prompt: usePrompt,
        finalResponse: phase2.finalResponse,
        items: phase2.items.length,
        durationMs: phase2Duration
      }
    };
  });

  app.get("/api/firehose/events", async (request) => {
    const limit = Number((request.query as Record<string, unknown>)["limit"] ?? 100);
    return options.store.listAllEvents(Number.isFinite(limit) ? limit : 100);
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

  app.post("/api/memory/reset", async () => {
    return options.store.clearProjectMemory(projectId);
  });

  app.all("/proxy/*", async (request, reply) => {
    const sessionId = request.headers["x-signal-recycler-session-id"]?.toString() ?? "proxy";
    const rules = options.store.listApprovedRules(projectId);
    const tail = request.url.replace(/^\/proxy/, "");
    const upstreamBaseUrl =
      options.upstreamBaseUrl ??
      process.env.SIGNAL_RECYCLER_UPSTREAM_URL ??
      "https://api.openai.com";
    const upstreamUrl = `${upstreamBaseUrl.replace(/\/$/, "")}${tail}`;

    // Snapshot original size + item count before any transformation
    const originalSize = sizeOf(request.body);
    const originalItems = countInputItems(request.body);

    // Step 1: compress noisy history items
    let rawBody = request.body;
    let charsRemoved = 0;
    let tokensRemoved = 0;
    let compressions = 0;
    if (rawBody && request.method === "POST") {
      const { body: compressed, result } = compressRequestBody(rawBody);
      if (result && result.charsRemoved > 0) {
        rawBody = compressed;
        charsRemoved = result.charsRemoved;
        tokensRemoved = result.tokensRemoved;
        compressions = result.compressions;
        options.store.createEvent({
          sessionId,
          category: "compression_result",
          title: `Compressed ${result.compressions} noisy output${result.compressions === 1 ? "" : "s"}`,
          body: `Removed ${result.charsRemoved.toLocaleString()} chars (≈${result.tokensRemoved.toLocaleString()} tokens) of stack-traces / error dumps before forwarding to Codex.`,
          metadata: {
            charsRemoved: result.charsRemoved,
            tokensRemoved: result.tokensRemoved,
            compressions: result.compressions
          }
        });
      }
    }

    // Step 2: inject approved playbook rules
    const body = rawBody ? injectProxyBody(rawBody, rules) : undefined;
    const finalSize = sizeOf(body);
    const finalItems = countInputItems(body);

    // One rich proxy_request event with full before → after telemetry
    options.store.createEvent({
      sessionId,
      category: "proxy_request",
      title: `${request.method} ${tail}`,
      body: buildProxyRequestSummary({
        method: request.method,
        tail,
        originalSize,
        finalSize,
        originalItems,
        finalItems,
        compressions,
        tokensRemoved,
        injectedRules: rules.length
      }),
      metadata: {
        method: request.method,
        path: tail,
        originalSize,
        finalSize,
        originalItems,
        finalItems,
        compressions,
        charsRemoved,
        tokensRemoved,
        injectedRules: rules.length,
        ruleIds: rules.map((r) => r.id)
      }
    });
    if (rules.length > 0) {
      options.store.createEvent({
        sessionId,
        category: "proxy_injection",
        title: `Injected ${rules.length} playbook rule${rules.length === 1 ? "" : "s"}`,
        body: rules.map((r, i) => `${i + 1}. [${r.category}] ${r.rule}`).join("\n"),
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
      headers.set("content-type", "application/json");
    }

    const fetchInit: RequestInit = { method: request.method, headers };
    if (body !== undefined) {
      fetchInit.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    const upstream = await fetch(upstreamUrl, fetchInit);

    reply.code(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (!shouldDropResponseHeader(key)) reply.header(key, value);
    });
    return reply.send(upstream.body);
  });

  return app;
}

function findFixtureDir(workingDirectory: string): string | null {
  // Walk up from the provided workingDirectory looking for fixtures/demo-repo,
  // then fall back to walking up from this source file. This makes the demo
  // work whether SIGNAL_RECYCLER_WORKDIR points at the repo root or anywhere else.
  const candidates = [
    path.resolve(workingDirectory, "fixtures/demo-repo"),
    path.resolve(workingDirectory, "..", "fixtures/demo-repo"),
    path.resolve(workingDirectory, "../..", "fixtures/demo-repo"),
    path.resolve(workingDirectory, "../../..", "fixtures/demo-repo")
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;
  }
  return null;
}

function sizeOf(body: unknown): number {
  if (body === undefined || body === null) return 0;
  if (typeof body === "string") return body.length;
  try {
    return JSON.stringify(body).length;
  } catch {
    return 0;
  }
}

function countInputItems(body: unknown): number {
  if (!body || typeof body !== "object" || Array.isArray(body)) return 0;
  const input = (body as Record<string, unknown>)["input"];
  if (Array.isArray(input)) return input.length;
  // After playbook injection, the system message is one extra item; we still count it
  return 0;
}

function buildProxyRequestSummary(input: {
  method: string;
  tail: string;
  originalSize: number;
  finalSize: number;
  originalItems: number;
  finalItems: number;
  compressions: number;
  tokensRemoved: number;
  injectedRules: number;
}): string {
  const lines: string[] = [];
  lines.push(`${input.method} ${input.tail}`);
  if (input.originalSize > 0) {
    const delta = input.finalSize - input.originalSize;
    const sign = delta >= 0 ? "+" : "";
    lines.push(
      `Payload: ${input.originalSize.toLocaleString()} → ${input.finalSize.toLocaleString()} chars (${sign}${delta.toLocaleString()})`
    );
  }
  if (input.originalItems > 0 || input.finalItems > 0) {
    lines.push(`Items: ${input.originalItems} → ${input.finalItems}`);
  }
  if (input.compressions > 0) {
    lines.push(
      `Compressed ${input.compressions} noisy output${input.compressions === 1 ? "" : "s"} (≈${input.tokensRemoved.toLocaleString()} tokens)`
    );
  }
  if (input.injectedRules > 0) {
    lines.push(
      `Injected ${input.injectedRules} approved playbook rule${input.injectedRules === 1 ? "" : "s"}`
    );
  }
  if (input.compressions === 0 && input.injectedRules === 0) {
    lines.push("Forwarded unchanged (no noise found, no rules to inject).");
  }
  return lines.join("\n");
}

function injectProxyBody(
  body: unknown,
  rules: ReturnType<SignalRecyclerStore["listApprovedRules"]>
): unknown {
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
  return ["connection", "content-length", "content-encoding", "transfer-encoding"].includes(
    key.toLowerCase()
  );
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
