import type { AppRoute } from "../types";

export type ParsedAppLocation = {
  route: AppRoute;
  sessionId: string | null;
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
  const normalized = normalizePath(pathname);
  const sessionMatch = normalized.match(/^\/sessions\/([^/]+)$/);
  if (sessionMatch) {
    return { route: "session", sessionId: decodeURIComponent(sessionMatch[1] ?? "") };
  }

  const route = (Object.entries(ROUTE_PATHS) as Array<[Exclude<AppRoute, "session">, string]>).find(
    ([, path]) => path === normalized
  )?.[0];

  return { route: route ?? "dashboard", sessionId: null };
}

export function pathForRoute(route: AppRoute, sessionId?: string | null): string {
  if (route === "session") {
    return sessionId ? `/sessions/${encodeURIComponent(sessionId)}` : "/sessions";
  }
  return ROUTE_PATHS[route];
}

function normalizePath(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.replace(/\/+$/, "");
}
