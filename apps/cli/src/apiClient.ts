import { type Agent, type ApiConfig, type RunResult, type SessionRecord, type TimelineEvent } from "./types.js";

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type ApiClient = ReturnType<typeof createApiClient>;

export function createApiClient(input: { baseUrl: string; fetchImpl?: FetchLike }) {
  const baseUrl = input.baseUrl.replace(/\/$/, "");
  const fetchImpl = input.fetchImpl ?? fetch;

  return {
    getConfig: () => request<ApiConfig>(fetchImpl, `${baseUrl}/api/config`),
    createSession: (title?: string) =>
      request<SessionRecord>(fetchImpl, `${baseUrl}/api/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(title ? { title } : {})
      }),
    runSession: (sessionId: string, prompt: string, agent: Agent) =>
      request<RunResult>(fetchImpl, `${baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, adapter: agent })
      }),
    listEvents: (sessionId: string) =>
      request<TimelineEvent[]>(fetchImpl, `${baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/events`)
  };
}

async function request<T>(fetchImpl: FetchLike, url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch (error) {
    throw new Error(`Signal Recycler API is not running at ${new URL(url).origin}. Start it with: pnpm dev`, {
      cause: error
    });
  }

  const text = await response.text();
  const body = parseBody(text);
  if (!response.ok) {
    throw new ApiError(errorMessage(body, response.statusText), response.status, body);
  }
  return body as T;
}

function parseBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function errorMessage(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null) {
    const message = (body as { message?: unknown; error?: unknown }).message ?? (body as { error?: unknown }).error;
    if (typeof message === "string") return message;
  }
  if (typeof body === "string" && body.trim()) return body;
  return fallback || "Signal Recycler API request failed";
}
