import type { ReactNode } from "react";
import {
  BarChart3,
  Boxes,
  Database,
  Folder,
  GitBranch,
  LayoutDashboard,
  List,
  Plus,
  RefreshCw,
  Settings,
  Sparkles,
  type LucideIcon
} from "lucide-react";
import type { ApiConfig } from "../api";
import type { AppRoute } from "../types";
import { Badge } from "./Badge";
import { Button } from "./Button";

const nav = [
  { route: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { route: "sessions", label: "Sessions", icon: List },
  { route: "memory", label: "Memory", icon: Database },
  { route: "context", label: "Context Index", icon: Boxes },
  { route: "evals", label: "Evals", icon: BarChart3 },
  { route: "sync", label: "Sync", icon: RefreshCw },
  { route: "settings", label: "Settings", icon: Settings }
] satisfies Array<{ route: AppRoute; label: string; icon: LucideIcon }>;

export function AppShell({
  config,
  route,
  counts,
  children,
  onRouteChange,
  onNewSession
}: {
  config: ApiConfig | null;
  route: AppRoute;
  counts: Partial<Record<AppRoute, number>>;
  children: ReactNode;
  onRouteChange: (route: AppRoute) => void;
  onNewSession: () => void;
}) {
  const projectName = config?.workingDirectoryBasename ?? "loading";

  return (
    <div className="min-h-screen bg-stone-50 text-stone-950">
      <header className="sticky top-0 z-30 flex h-14 items-center border-b border-stone-200 bg-white px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="grid size-7 place-items-center rounded bg-stone-950 text-xs font-bold text-white">
            SR
          </div>
          <div className="font-semibold">Signal Recycler</div>
          <div className="text-xs text-stone-400">v0.4.5</div>
          <div className="ml-4 hidden min-w-0 items-center gap-2 rounded-md border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm md:flex">
            <Folder size={15} />
            <span className="truncate">project {projectName}</span>
          </div>
          <div className="hidden items-center gap-2 rounded-md border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm lg:flex">
            <GitBranch size={15} />
            <span>local worktree</span>
          </div>
          <div className="hidden items-center gap-2 rounded-md border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm lg:flex">
            <Sparkles size={15} />
            <span>adapter auto</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-md border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs text-stone-600">
            <span className="mr-1 inline-block size-2 rounded-full bg-green-500" />
            local
          </span>
          <Button variant="primary" onClick={onNewSession}>
            <Plus size={16} />
            New session
          </Button>
        </div>
      </header>
      <div className="grid min-h-[calc(100vh-3.5rem)] grid-cols-[240px_minmax(0,1fr)]">
        <aside className="flex flex-col border-r border-stone-200 bg-white">
          <nav className="flex-1 p-3">
            <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-stone-400">
              Workspace
            </div>
            {nav.slice(0, 5).map((item) => (
              <ShellNavItem
                key={item.route}
                item={item}
                active={route === item.route}
                count={counts[item.route]}
                onClick={() => onRouteChange(item.route)}
              />
            ))}
            <div className="mb-2 mt-5 px-2 text-xs font-semibold uppercase tracking-wide text-stone-400">
              System
            </div>
            {nav.slice(5).map((item) => (
              <ShellNavItem
                key={item.route}
                item={item}
                active={route === item.route}
                count={counts[item.route]}
                onClick={() => onRouteChange(item.route)}
              />
            ))}
          </nav>
          <div className="border-t border-stone-200 p-3 text-xs text-stone-500">
            <div>
              <span className="mr-1 inline-block size-2 rounded-full bg-green-500" />
              Local store
            </div>
            <div className="mt-1 truncate font-mono">.signal-recycler/{projectName}</div>
          </div>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}

function ShellNavItem({
  item,
  active,
  count,
  onClick
}: {
  item: (typeof nav)[number];
  active: boolean;
  count: number | undefined;
  onClick: () => void;
}) {
  const Icon = item.icon;

  return (
    <button
      aria-current={active ? "page" : undefined}
      className={`mb-1 flex h-9 w-full items-center gap-3 rounded-md px-2 text-left text-sm ${active ? "bg-stone-100 font-semibold text-stone-950" : "text-stone-600 hover:bg-stone-50"}`}
      onClick={onClick}
      type="button"
    >
      <Icon size={16} />
      <span className="flex-1">{item.label}</span>
      {count !== undefined ? <Badge title={`${item.label} count`}>{count}</Badge> : null}
    </button>
  );
}
