import { type FastifyInstance } from "fastify";
import { compressRequestBody } from "../compressor.js";
import { injectIntoRequestBody } from "../playbook.js";
import { type SignalRecyclerStore } from "../store.js";
import { type CodexRunner } from "../types.js";

export type RouteOptions = {
  store: SignalRecyclerStore;
  codexRunner: CodexRunner;
  projectId: string;
  workingDirectory: string;
  upstreamBaseUrl?: string;
};

export async function registerProxyRoutes(
  app: FastifyInstance,
  options: RouteOptions
): Promise<void> {
  app.all("/proxy/*", async (request, reply) => {
    const sessionId = request.headers["x-signal-recycler-session-id"]?.toString() ?? "proxy";
    const rules = options.store.listApprovedRules(options.projectId);
    const tail = request.url.replace(/^\/proxy/, "");
    const upstreamBaseUrl =
      options.upstreamBaseUrl ??
      process.env.SIGNAL_RECYCLER_UPSTREAM_URL ??
      "https://api.openai.com";
    const upstreamUrl = `${upstreamBaseUrl.replace(/\/$/, "")}${tail}`;

    const originalSize = sizeOf(request.body);
    const originalItems = countInputItems(request.body);

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
            projectId: options.projectId,
            charsRemoved: result.charsRemoved,
            tokensRemoved: result.tokensRemoved,
            compressions: result.compressions
          }
        });
      }
    }

    const body = rawBody ? injectProxyBody(rawBody, rules) : undefined;
    const finalSize = sizeOf(body);
    const finalItems = countInputItems(body);

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
        projectId: options.projectId,
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

export const REQUEST_ENTITY_HEADERS_TO_DROP_BEFORE_PARSE = [
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
