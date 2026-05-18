import type { AppRoute } from "../types";

export type ParsedAppLocation = {
  route: AppRoute;
  sessionId: string | null;
  contextChunkId?: string | null;
};

const ROUTE_PATHS: Record<Exclude<AppRoute, "session">, string> = {
  dashboard: "/",
  sessions: "/sessions",
  memory: "/memory",
  context: "/context-index",
  evals: "/evals",
  sync: "/sync",
  settings: "/settings"
};

export function parseAppLocation(pathname: string): ParsedAppLocation {
  const [rawPathname = "/", rawSearch = ""] = pathname.split("?", 2);
  const normalized = normalizePath(rawPathname);
  const sessionMatch = normalized.match(/^\/sessions\/([^/]+)$/);
  if (sessionMatch) {
    const sessionId = safeDecodeURIComponent(sessionMatch[1] ?? "");
    return sessionId ? { route: "session", sessionId } : { route: "sessions", sessionId: null };
  }

  const route = (Object.entries(ROUTE_PATHS) as Array<[Exclude<AppRoute, "session">, string]>).find(
    ([, path]) => path === normalized
  )?.[0];

  if (route === "context") {
    return {
      route,
      sessionId: null,
      contextChunkId: parseContextChunkId(rawSearch)
    };
  }

  return { route: route ?? "dashboard", sessionId: null };
}

export function pathForRoute(route: AppRoute, sessionId?: string | null, contextChunkId?: string | null): string {
  if (route === "session") {
    return sessionId ? `/sessions/${encodeURIComponent(sessionId)}` : "/sessions";
  }
  if (route === "context" && contextChunkId) {
    return `${ROUTE_PATHS[route]}?chunk=${encodeURIComponent(contextChunkId)}`;
  }
  return ROUTE_PATHS[route];
}

function normalizePath(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.replace(/\/+$/, "");
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function parseContextChunkId(search: string): string | null {
  const params = new URLSearchParams(search);
  const chunk = params.get("chunk");
  return chunk?.trim() || null;
}
