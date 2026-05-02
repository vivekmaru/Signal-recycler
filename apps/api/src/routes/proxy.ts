import { type FastifyInstance } from "fastify";
import { compressRequestBody } from "../compressor.js";
import { injectIntoRequestBody, stripPlaybookBlocks } from "../playbook.js";
import { recordMemoryInjection } from "../services/memoryInjection.js";
import { retrieveRelevantMemories } from "../services/memoryRetrieval.js";
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

    const retrievalQuery = extractProxyQueryText(rawBody);
    const retrieval =
      rules.length > 0 && retrievalQuery.length > 0
        ? retrieveRelevantMemories({
            store: options.store,
            projectId: options.projectId,
            query: retrievalQuery,
            limit: 5
          })
        : null;
    if (retrieval) {
      options.store.createEvent({
        sessionId,
        category: "memory_retrieval",
        title: `Retrieved ${retrieval.metrics.selectedMemories} of ${retrieval.metrics.approvedMemories} approved memories`,
        body: buildMemoryRetrievalSummary(retrieval.metrics.selectedMemories, retrieval.metrics.skippedMemories),
        metadata: {
          projectId: options.projectId,
          query: retrieval.query,
          selected: retrieval.selected,
          skipped: retrieval.skipped,
          metrics: retrieval.metrics
        }
      });
    }

    const selectedRules = retrieval?.memories ?? [];
    const injection = rawBody
      ? injectProxyBody(rawBody, selectedRules)
      : { body: undefined, injected: false };
    const body = injection.body;
    const finalSize = sizeOf(body);
    const finalItems = countInputItems(body);
    const injectedRules = injection.injected ? selectedRules.length : 0;

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
        injectedRules
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
        injectedRules,
        ruleIds: injection.injected ? selectedRules.map((r) => r.id) : [],
        retrieval: retrieval
          ? {
              query: retrieval.query,
              selected: retrieval.selected,
              skipped: retrieval.skipped,
              metrics: retrieval.metrics
            }
          : null
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
    if (injection.injected) {
      try {
        recordMemoryInjection({
          store: options.store,
          projectId: options.projectId,
          sessionId,
          adapter: "proxy",
          memories: selectedRules,
          reason: "approved_project_memory",
          metadata: {
            method: request.method,
            path: tail,
            retrieval: retrieval
              ? {
                  query: retrieval.query,
                  selected: retrieval.selected,
                  skipped: retrieval.skipped,
                  metrics: retrieval.metrics
                }
              : null
          }
        });
      } catch (error) {
        request.log.warn(
          {
            err: error,
            projectId: options.projectId,
            sessionId,
            path: tail
          },
          "Memory injection audit failed after upstream proxy response"
        );
      }
    }

    reply.code(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (!shouldDropResponseHeader(key)) reply.header(key, value);
    });
    return reply.send(upstream.body);
  });
}

function buildMemoryRetrievalSummary(selected: number, skipped: number): string {
  return `Selected ${selected} approved memor${selected === 1 ? "y" : "ies"}; skipped ${skipped}.`;
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
): { body: unknown; injected: boolean } {
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body) as unknown;
      const injectedBody = injectIntoRequestBody(parsed, rules);
      return { body: injectedBody, injected: !jsonEqual(parsed, injectedBody) };
    } catch {
      return { body, injected: false };
    }
  }
  const injectedBody = injectIntoRequestBody(body, rules);
  return { body: injectedBody, injected: !jsonEqual(body, injectedBody) };
}

function extractProxyQueryText(body: unknown): string {
  if (body === undefined || body === null) return "";
  if (typeof body === "string") {
    try {
      return extractProxyQueryText(JSON.parse(body) as unknown);
    } catch {
      return "";
    }
  }
  if (!isPlainObject(body)) return "";

  const record = body as Record<string, unknown>;
  const promptParts = [
    extractUserText(record.input),
    extractUserText(record.messages)
  ].filter((part) => part.length > 0);

  if (promptParts.length > 0) return promptParts.join("\n\n");
  return extractPlainText(record.instructions);
}

function extractUserText(value: unknown): string {
  if (typeof value === "string") return cleanRetrievalText(value);
  if (Array.isArray(value)) {
    return value.map(extractUserText).filter((part) => part.length > 0).join("\n");
  }
  if (!isPlainObject(value)) return "";

  const role = typeof value.role === "string" ? value.role.toLowerCase() : null;
  if (role && role !== "user") return "";

  const text = extractUserText(value.text);
  const content = extractUserText(value.content);
  return [text, content].filter((part) => part.length > 0).join("\n");
}

function extractPlainText(value: unknown): string {
  if (typeof value === "string") return cleanRetrievalText(value);
  if (Array.isArray(value)) {
    return value.map(extractPlainText).filter((part) => part.length > 0).join("\n");
  }
  if (!isPlainObject(value)) return "";

  const text = extractPlainText(value.text);
  const content = extractPlainText(value.content);
  return [text, content].filter((part) => part.length > 0).join("\n");
}

function cleanRetrievalText(value: string): string {
  return stripPlaybookBlocks(value).trim();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
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
