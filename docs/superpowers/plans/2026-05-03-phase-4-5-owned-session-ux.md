# Phase 4.5 Owned Session UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hackathon dashboard with an owned-session control plane centered on session inspection, memory provenance, context-envelope visibility, and review workflows.

**Architecture:** Keep the existing API contracts and SQLite store. Split the web app from one large `App.tsx` into route-level views, shared shell components, and pure presenter helpers that derive UI state from real sessions, events, memories, audits, and config. Use clearly labeled preview/empty states for Context Index, Evals, Compare, Replay, and other future-phase surfaces instead of fake runtime claims.

**Tech Stack:** React, TypeScript, Vite, Tailwind CSS v4, Vitest, Fastify API, shared Zod/TypeScript schemas from `@signal-recycler/shared`.

---

## Scope Anchor

Roadmap phase: **Phase 4.5: Signal Recycler-Owned Session UX**.

Phase goal: make the dashboard the primary way to run and inspect memory-managed sessions while keeping CLI entry points available.

Success criteria this plan covers:

- Dashboard-owned runs can choose an implemented adapter, including `codex_cli` when enabled.
- Users can inspect sessions, events, memory retrieval/injection, skipped memories, and context-envelope metadata.
- Dashboard separates agent transcript, durable memory, retrieved/skipped context, compression, errors, and memory candidates.
- Memory review has a table and inspector with provenance/audit data.
- Context Index and Evals exist only as honest preview/read-only surfaces unless backed by real data.

Explicit out of scope:

- Full source/repo indexing.
- Vector retrieval, embedding, cosine, reranking UI unless implemented later.
- Cloud sync implementation.
- Full Claude Code adapter.
- Real Compare/Replay execution unless a backend API already exists.

## Target File Structure

Create:

- `apps/web/src/types.ts`
  - Web-only view state types: routes, selected inspector item, session summaries, app metrics.
- `apps/web/src/lib/format.ts`
  - Date, duration, id, count, token delta, and metadata formatting helpers.
- `apps/web/src/lib/eventPresenters.ts`
  - Pure helpers for categorizing, grouping, filtering, and summarizing timeline events.
- `apps/web/src/lib/memoryPresenters.ts`
  - Pure helpers for memory status counts, audit summaries, and display labels.
- `apps/web/src/lib/sessionPresenters.ts`
  - Pure helpers for deriving session summaries and dashboard cards from sessions/events/memories.
- `apps/web/src/hooks/useDashboardData.ts`
  - Polls config, sessions, firehose events, memories, and memory audit on demand.
- `apps/web/src/components/AppShell.tsx`
  - Persistent sidebar, top bar, sync/local-store status, route selection.
- `apps/web/src/components/Badge.tsx`
  - Reusable status, type, confidence, count, and scope badges.
- `apps/web/src/components/Button.tsx`
  - Reusable primary/secondary/ghost/icon button styles.
- `apps/web/src/components/InspectorPanel.tsx`
  - Right-side inspector shell with collapsible mobile behavior.
- `apps/web/src/components/MetricTile.tsx`
  - Dashboard/session summary metrics.
- `apps/web/src/components/Timeline.tsx`
  - Grouped event timeline and event row rendering.
- `apps/web/src/components/NewSessionDialog.tsx`
  - Prompt, adapter, memory policy, and run-mode entry flow.
- `apps/web/src/views/DashboardView.tsx`
  - Operational dashboard overview.
- `apps/web/src/views/SessionsView.tsx`
  - Dense sessions table with filters and search.
- `apps/web/src/views/SessionDetailView.tsx`
  - North-star session detail with summary strip, tabs, grouped timeline, and inspector.
- `apps/web/src/views/MemoryView.tsx`
  - Memory table and provenance/audit inspector.
- `apps/web/src/views/ContextIndexView.tsx`
  - Honest preview/read-only retrieval preview surface.
- `apps/web/src/views/EvalsView.tsx`
  - Honest read-only/empty eval proof surface.
- Test files beside helpers:
  - `apps/web/src/lib/eventPresenters.test.ts`
  - `apps/web/src/lib/memoryPresenters.test.ts`
  - `apps/web/src/lib/sessionPresenters.test.ts`

Modify:

- `apps/web/src/App.tsx`
  - Shrink to top-level route state, data hook, new-session orchestration, and view routing.
- `apps/web/src/api.ts`
  - Add API clients for sessions list, memory audit, memory retrieval preview, and adapter-aware session runs.
- `apps/web/src/styles.css`
  - Replace hackathon panel/button/timeline styles with shell/table/inspector/timeline primitives.
- `packages/shared/src/index.ts`
  - Only if needed for missing exported types. Prefer web-local types for presentation data.

Avoid:

- Adding a frontend router dependency. Local route state is enough for Phase 4.5.
- Adding charting libraries. Tables, badges, and simple bars are enough.
- Implementing fake source indexing data.

## Task 1: Extend Web API Client

**Files:**

- Modify: `apps/web/src/api.ts`

- [ ] **Step 1: Add failing type-level API usage test by running TypeScript after expected call sites are planned**

No separate test file is needed for this task. The later view tasks will import the new API helpers and `pnpm --filter @signal-recycler/web type-check` should fail until this task is implemented.

- [ ] **Step 2: Add API helper types and functions**

In `apps/web/src/api.ts`, replace the current imports and add these exported types/functions while preserving existing functions:

```ts
import type {
  AgentAdapter,
  MemoryRecord,
  MemoryRetrievalResult,
  MemoryUsage,
  PlaybookRule,
  SessionRecord,
  TimelineEvent
} from "@signal-recycler/shared";
```

Add after `RunResult`:

```ts
export type MemoryAuditResult = {
  memory: MemoryRecord;
  usages: MemoryUsage[];
};

export type MemoryRetrievalPreview = MemoryRetrievalResult;
```

Add or update functions:

```ts
export async function listSessions(): Promise<SessionRecord[]> {
  return readJson(await fetch("/api/sessions"));
}

export async function listMemories(): Promise<MemoryRecord[]> {
  return readJson(await fetch("/api/memories"));
}

export async function fetchMemoryAudit(id: string): Promise<MemoryAuditResult> {
  return readJson(await fetch(`/api/memories/${id}/audit`));
}

export async function previewMemoryRetrieval(input: {
  prompt: string;
  limit?: number;
}): Promise<MemoryRetrievalPreview> {
  const response = await fetch("/api/memory/retrieve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return readJson(response);
}

export async function runSession(
  sessionId: string,
  prompt: string,
  adapter: AgentAdapter = "default"
): Promise<RunResult> {
  const response = await fetch(`/api/sessions/${sessionId}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, adapter })
  });
  return readJson(response);
}
```

Keep the legacy `listRules()` function as a compatibility alias:

```ts
export async function listRules(): Promise<PlaybookRule[]> {
  return readJson(await fetch("/api/rules"));
}
```

- [ ] **Step 3: Run type-check**

Run:

```bash
pnpm --filter @signal-recycler/web type-check
```

Expected: pass, because the new helpers are additive.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/api.ts
git commit -m "feat(web): add owned-session api helpers"
```

## Task 2: Add Formatting And Presenter Helpers

**Files:**

- Create: `apps/web/src/types.ts`
- Create: `apps/web/src/lib/format.ts`
- Create: `apps/web/src/lib/eventPresenters.ts`
- Create: `apps/web/src/lib/eventPresenters.test.ts`
- Create: `apps/web/src/lib/memoryPresenters.ts`
- Create: `apps/web/src/lib/memoryPresenters.test.ts`
- Create: `apps/web/src/lib/sessionPresenters.ts`
- Create: `apps/web/src/lib/sessionPresenters.test.ts`

- [ ] **Step 1: Add web UI types**

Create `apps/web/src/types.ts`:

```ts
import type { MemoryRecord, SessionRecord, TimelineEvent } from "@signal-recycler/shared";

export type AppRoute = "dashboard" | "sessions" | "session" | "memory" | "context" | "evals" | "sync" | "settings";

export type SessionStatus = "running" | "needs_review" | "done" | "failed";

export type InspectorSelection =
  | { type: "empty" }
  | { type: "event"; event: TimelineEvent }
  | { type: "memory"; memory: MemoryRecord }
  | { type: "session"; session: SessionRecord };

export type SessionSummary = {
  session: SessionRecord;
  title: string;
  status: SessionStatus;
  adapter: string;
  startedAt: string;
  durationLabel: string;
  memoryIn: number;
  newMemory: number;
  tokenDelta: number;
  eventCount: number;
};

export type TimelineGroupId = "agent" | "context" | "memory" | "tools" | "errors" | "files";

export type TimelineGroup = {
  id: TimelineGroupId;
  title: string;
  events: TimelineEvent[];
};
```

- [ ] **Step 2: Write failing presenter tests**

Create `apps/web/src/lib/eventPresenters.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { TimelineEvent } from "@signal-recycler/shared";
import { groupTimelineEvents, summarizeMemoryRetrieval } from "./eventPresenters";

const baseEvent = {
  id: "event_1",
  sessionId: "session_1",
  createdAt: "2026-05-03T00:00:00.000Z",
  metadata: {}
} satisfies Omit<TimelineEvent, "category" | "title" | "body">;

describe("event presenters", () => {
  it("groups events by product concern", () => {
    const groups = groupTimelineEvents([
      { ...baseEvent, id: "e1", category: "codex_event", title: "Agent message", body: "ok" },
      { ...baseEvent, id: "e2", category: "memory_retrieval", title: "Retrieved", body: "selected" },
      { ...baseEvent, id: "e3", category: "memory_injection", title: "Injected", body: "memory" },
      { ...baseEvent, id: "e4", category: "compression_result", title: "Compressed", body: "logs" }
    ]);

    expect(groups.map((group) => [group.id, group.events.map((event) => event.id)])).toEqual([
      ["agent", ["e1"]],
      ["context", ["e2", "e4"]],
      ["memory", ["e3"]]
    ]);
  });

  it("summarizes memory retrieval metadata", () => {
    expect(
      summarizeMemoryRetrieval({
        approvedMemories: 3,
        selectedMemories: 1,
        skippedMemories: 2,
        limit: 5
      })
    ).toBe("Selected 1 · skipped 2 · approved 3");
  });
});
```

Create `apps/web/src/lib/memoryPresenters.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { MemoryRecord } from "@signal-recycler/shared";
import { countMemoriesByStatus, memorySourceLabel } from "./memoryPresenters";

function memory(id: string, status: MemoryRecord["status"], source: MemoryRecord["source"]): MemoryRecord {
  return {
    id,
    projectId: "demo",
    status,
    category: "tooling",
    rule: "Use pnpm.",
    reason: "Manual rule.",
    sourceEventId: null,
    createdAt: "2026-05-03T00:00:00.000Z",
    approvedAt: status === "approved" ? "2026-05-03T00:00:00.000Z" : null,
    memoryType: "rule",
    scope: { type: "project", value: null },
    source,
    confidence: "high",
    lastUsedAt: null,
    supersededBy: null,
    syncStatus: "local",
    updatedAt: "2026-05-03T00:00:00.000Z"
  };
}

describe("memory presenters", () => {
  it("counts memory status buckets", () => {
    expect(
      countMemoriesByStatus([
        memory("a", "approved", { kind: "manual", author: "local-user" }),
        memory("b", "pending", { kind: "manual", author: "local-user" }),
        memory("c", "rejected", { kind: "manual", author: "local-user" })
      ])
    ).toEqual({ all: 3, approved: 1, pending: 1, rejected: 1, superseded: 0 });
  });

  it("formats memory provenance source labels", () => {
    expect(memorySourceLabel({ kind: "manual", author: "local-user" })).toBe("manual");
    expect(memorySourceLabel({ kind: "import", label: "api" })).toBe("api import");
    expect(memorySourceLabel({ kind: "synced_file", path: "AGENTS.md", section: null })).toBe("AGENTS.md");
  });
});
```

Create `apps/web/src/lib/sessionPresenters.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { SessionRecord, TimelineEvent } from "@signal-recycler/shared";
import { summarizeSession } from "./sessionPresenters";

const session: SessionRecord = {
  id: "session_1",
  projectId: "demo",
  title: "Run validation",
  createdAt: "2026-05-03T00:00:00.000Z"
};

function event(input: Partial<TimelineEvent> & Pick<TimelineEvent, "id" | "category">): TimelineEvent {
  return {
    sessionId: session.id,
    title: input.title ?? "Event",
    body: input.body ?? "",
    metadata: input.metadata ?? {},
    createdAt: input.createdAt ?? "2026-05-03T00:00:00.000Z",
    ...input
  };
}

describe("session presenters", () => {
  it("derives session status and memory counts from events", () => {
    const summary = summarizeSession(session, [
      event({ id: "e1", category: "codex_event", title: "User prompt", body: "Test" }),
      event({
        id: "e2",
        category: "memory_injection",
        metadata: { memoryIds: ["mem_1", "mem_2"], adapter: "codex_cli" }
      }),
      event({ id: "e3", category: "rule_candidate", title: "Rule candidate", body: "Use pnpm." })
    ]);

    expect(summary).toMatchObject({
      title: "Run validation",
      status: "needs_review",
      adapter: "codex_cli",
      memoryIn: 2,
      newMemory: 1,
      eventCount: 3
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
pnpm --filter @signal-recycler/web test -- eventPresenters.test.ts memoryPresenters.test.ts sessionPresenters.test.ts
```

Expected: fail because the helpers do not exist.

- [ ] **Step 4: Implement formatting helpers**

Create `apps/web/src/lib/format.ts`:

```ts
export function compactId(id: string): string {
  const [prefix, value] = id.split("_");
  if (!value) return id.length > 10 ? `${id.slice(0, 10)}…` : id;
  return `${prefix}_${value.slice(0, 6)}`;
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

export function formatDuration(start: string, end?: string): string {
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((endMs - startMs) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes === 0) return `${remainder}s`;
  return `${minutes}m ${remainder.toString().padStart(2, "0")}s`;
}

export function formatTokenDelta(value: number): string {
  if (value === 0) return "0";
  const sign = value > 0 ? "+" : "";
  const absolute = Math.abs(value);
  const formatted = absolute >= 1000 ? `${(absolute / 1000).toFixed(1)}k` : String(absolute);
  return `${sign}${value < 0 ? "-" : ""}${formatted}`;
}
```

- [ ] **Step 5: Implement event presenters**

Create `apps/web/src/lib/eventPresenters.ts`:

```ts
import type { EventCategory, MemoryRetrievalResult, TimelineEvent } from "@signal-recycler/shared";
import type { TimelineGroup, TimelineGroupId } from "../types";

const GROUP_TITLES: Record<TimelineGroupId, string> = {
  agent: "Agent Activity",
  context: "Context Operations",
  memory: "Memory Events",
  tools: "Tool Calls",
  errors: "Errors",
  files: "Files"
};

export function eventGroupId(event: TimelineEvent): TimelineGroupId {
  if (event.title.toLowerCase().includes("failed") || event.metadata["phase"] === "codex_error") {
    return "errors";
  }
  if (event.category === "codex_event") {
    const title = event.title.toLowerCase();
    if (title.includes("tool") || title.includes("command")) return "tools";
    return "agent";
  }
  if (event.category === "memory_injection" || event.category === "rule_candidate" || event.category === "rule_auto_approved") {
    return "memory";
  }
  if (event.category === "memory_retrieval" || event.category === "compression_result" || event.category === "proxy_request") {
    return "context";
  }
  return "agent";
}

export function groupTimelineEvents(events: TimelineEvent[]): TimelineGroup[] {
  const grouped = new Map<TimelineGroupId, TimelineEvent[]>();
  for (const event of events) {
    const id = eventGroupId(event);
    grouped.set(id, [...(grouped.get(id) ?? []), event]);
  }
  return Array.from(grouped.entries()).map(([id, groupEvents]) => ({
    id,
    title: GROUP_TITLES[id],
    events: groupEvents
  }));
}

export function eventTone(category: EventCategory): "neutral" | "green" | "amber" | "red" | "blue" {
  if (category === "memory_injection" || category === "memory_retrieval") return "blue";
  if (category === "rule_candidate") return "amber";
  if (category === "rule_auto_approved") return "green";
  if (category === "compression_result") return "green";
  return "neutral";
}

export function summarizeMemoryRetrieval(metrics: MemoryRetrievalResult["metrics"]): string {
  return `Selected ${metrics.selectedMemories} · skipped ${metrics.skippedMemories} · approved ${metrics.approvedMemories}`;
}
```

- [ ] **Step 6: Implement memory presenters**

Create `apps/web/src/lib/memoryPresenters.ts`:

```ts
import type { MemoryRecord, MemorySource } from "@signal-recycler/shared";

export function countMemoriesByStatus(memories: MemoryRecord[]) {
  return {
    all: memories.length,
    approved: memories.filter((memory) => memory.status === "approved" && !memory.supersededBy).length,
    pending: memories.filter((memory) => memory.status === "pending").length,
    rejected: memories.filter((memory) => memory.status === "rejected").length,
    superseded: memories.filter((memory) => memory.supersededBy).length
  };
}

export function memorySourceLabel(source: MemorySource): string {
  switch (source.kind) {
    case "manual":
      return "manual";
    case "event":
      return "learned";
    case "synced_file":
      return source.path;
    case "import":
      return `${source.label} import`;
    case "source_chunk":
      return source.path;
  }
}

export function memoryScopeLabel(memory: MemoryRecord): string {
  return memory.scope.value ? `${memory.scope.type}:${memory.scope.value}` : memory.scope.type;
}

export function confidenceValue(memory: MemoryRecord): number {
  if (memory.confidence === "high") return 0.9;
  if (memory.confidence === "medium") return 0.7;
  return 0.4;
}
```

- [ ] **Step 7: Implement session presenters**

Create `apps/web/src/lib/sessionPresenters.ts`:

```ts
import type { MemoryRecord, SessionRecord, TimelineEvent } from "@signal-recycler/shared";
import type { SessionStatus, SessionSummary } from "../types";
import { formatDuration } from "./format";

export function summarizeSession(session: SessionRecord, events: TimelineEvent[]): SessionSummary {
  const hasError = events.some((event) => event.metadata["phase"] === "codex_error" || /failed/i.test(event.title));
  const hasPendingMemory = events.some((event) => event.category === "rule_candidate");
  const hasRunning = events.some((event) => /running/i.test(event.title));
  const status: SessionStatus = hasError
    ? "failed"
    : hasPendingMemory
      ? "needs_review"
      : hasRunning
        ? "running"
        : "done";
  const memoryIn = events.reduce((sum, event) => {
    if (event.category !== "memory_injection") return sum;
    const ids = event.metadata["memoryIds"];
    return sum + (Array.isArray(ids) ? ids.length : 0);
  }, 0);
  const newMemory = events.filter((event) => event.category === "rule_candidate").length;
  const adapterEvent = events.find((event) => typeof event.metadata["adapter"] === "string");

  return {
    session,
    title: session.title,
    status,
    adapter: String(adapterEvent?.metadata["adapter"] ?? "default"),
    startedAt: session.createdAt,
    durationLabel: formatDuration(session.createdAt, events.at(-1)?.createdAt),
    memoryIn,
    newMemory,
    tokenDelta: deriveTokenDelta(events),
    eventCount: events.length
  };
}

export function buildDashboardMetrics(input: {
  sessions: SessionRecord[];
  events: TimelineEvent[];
  memories: MemoryRecord[];
}) {
  return {
    activeSessions: input.sessions.filter((session) =>
      input.events.some((event) => event.sessionId === session.id && /running/i.test(event.title))
    ).length,
    approvedMemory: input.memories.filter((memory) => memory.status === "approved" && !memory.supersededBy).length,
    pendingMemory: input.memories.filter((memory) => memory.status === "pending").length,
    recentContextEvents: input.events.filter((event) =>
      ["memory_retrieval", "memory_injection", "compression_result"].includes(event.category)
    ).length
  };
}

function deriveTokenDelta(events: TimelineEvent[]): number {
  return events.reduce((sum, event) => {
    if (event.category !== "compression_result") return sum;
    return sum - Number(event.metadata["tokensRemoved"] ?? 0);
  }, 0);
}
```

- [ ] **Step 8: Run tests**

Run:

```bash
pnpm --filter @signal-recycler/web test -- eventPresenters.test.ts memoryPresenters.test.ts sessionPresenters.test.ts
```

Expected: pass.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/types.ts apps/web/src/lib
git commit -m "feat(web): add dashboard presenter helpers"
```

## Task 3: Add Shared Shell Components And Styles

**Files:**

- Create: `apps/web/src/components/Badge.tsx`
- Create: `apps/web/src/components/Button.tsx`
- Create: `apps/web/src/components/MetricTile.tsx`
- Create: `apps/web/src/components/AppShell.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Create reusable badges**

Create `apps/web/src/components/Badge.tsx`:

```tsx
import type { ReactNode } from "react";

type BadgeTone = "neutral" | "green" | "amber" | "red" | "blue" | "purple";

const toneClass: Record<BadgeTone, string> = {
  neutral: "border-stone-200 bg-stone-100 text-stone-700",
  green: "border-green-200 bg-green-50 text-green-700",
  amber: "border-amber-300 bg-amber-50 text-amber-800",
  red: "border-red-200 bg-red-50 text-red-700",
  blue: "border-sky-200 bg-sky-50 text-sky-700",
  purple: "border-violet-200 bg-violet-50 text-violet-700"
};

export function Badge({
  children,
  tone = "neutral",
  title
}: {
  children: ReactNode;
  tone?: BadgeTone;
  title?: string;
}) {
  return (
    <span
      className={`inline-flex h-6 items-center rounded border px-2 font-mono text-xs leading-none ${toneClass[tone]}`}
      title={title}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 2: Create shared buttons**

Create `apps/web/src/components/Button.tsx`:

```tsx
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const variantClass: Record<ButtonVariant, string> = {
  primary: "border-amber-700 bg-amber-600 text-white hover:bg-amber-700",
  secondary: "border-stone-300 bg-white text-stone-900 hover:bg-stone-50",
  ghost: "border-transparent bg-transparent text-stone-700 hover:bg-stone-100",
  danger: "border-red-200 bg-white text-red-700 hover:bg-red-50"
};

export function Button({
  children,
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
}) {
  return (
    <button
      className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${variantClass[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 3: Create metric tile**

Create `apps/web/src/components/MetricTile.tsx`:

```tsx
import type { ReactNode } from "react";

export function MetricTile({
  label,
  value,
  detail,
  children
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="rounded-md border border-stone-200 bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-stone-950">{value}</div>
      {detail ? <div className="mt-2 text-xs text-stone-500">{detail}</div> : null}
      {children}
    </section>
  );
}
```

- [ ] **Step 4: Create app shell**

Create `apps/web/src/components/AppShell.tsx`:

```tsx
import { BarChart3, Boxes, Database, Folder, GitBranch, LayoutDashboard, List, Settings, Sparkles, RefreshCw } from "lucide-react";
import type { ApiConfig } from "../api";
import type { AppRoute } from "../types";
import { Button } from "./Button";

const nav = [
  { route: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { route: "sessions", label: "Sessions", icon: List },
  { route: "memory", label: "Memory", icon: Database },
  { route: "context", label: "Context Index", icon: Boxes },
  { route: "evals", label: "Evals", icon: BarChart3 },
  { route: "sync", label: "Sync", icon: RefreshCw },
  { route: "settings", label: "Settings", icon: Settings }
] satisfies Array<{ route: AppRoute; label: string; icon: typeof LayoutDashboard }>;

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
  children: React.ReactNode;
  onRouteChange: (route: AppRoute) => void;
  onNewSession: () => void;
}) {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-950">
      <header className="sticky top-0 z-30 flex h-14 items-center border-b border-stone-200 bg-white px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="grid size-7 place-items-center rounded bg-stone-950 text-xs font-bold text-white">SR</div>
          <div className="font-semibold">Signal Recycler</div>
          <div className="text-xs text-stone-400">v0.4.5</div>
          <div className="ml-4 hidden min-w-0 items-center gap-2 rounded-md border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm md:flex">
            <Folder size={15} />
            <span className="truncate">project {config?.workingDirectoryBasename ?? "loading"}</span>
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
          <Button variant="primary" onClick={onNewSession}>+ New session</Button>
        </div>
      </header>
      <div className="grid min-h-[calc(100vh-3.5rem)] grid-cols-[240px_minmax(0,1fr)]">
        <aside className="flex flex-col border-r border-stone-200 bg-white">
          <nav className="flex-1 p-3">
            <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-stone-400">Workspace</div>
            {nav.slice(0, 5).map((item) => (
              <ShellNavItem key={item.route} item={item} active={route === item.route} count={counts[item.route]} onClick={() => onRouteChange(item.route)} />
            ))}
            <div className="mb-2 mt-5 px-2 text-xs font-semibold uppercase tracking-wide text-stone-400">System</div>
            {nav.slice(5).map((item) => (
              <ShellNavItem key={item.route} item={item} active={route === item.route} count={counts[item.route]} onClick={() => onRouteChange(item.route)} />
            ))}
          </nav>
          <div className="border-t border-stone-200 p-3 text-xs text-stone-500">
            <div><span className="mr-1 inline-block size-2 rounded-full bg-green-500" />Local store</div>
            <div className="mt-1 truncate font-mono">.signal-recycler/{config?.workingDirectoryBasename ?? "project"}</div>
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
  count?: number;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      className={`mb-1 flex h-9 w-full items-center gap-3 rounded-md px-2 text-left text-sm ${active ? "bg-stone-100 font-semibold text-stone-950" : "text-stone-600 hover:bg-stone-50"}`}
      onClick={onClick}
    >
      <Icon size={16} />
      <span className="flex-1">{item.label}</span>
      {count !== undefined ? <span className="font-mono text-xs text-stone-400">{count}</span> : null}
    </button>
  );
}
```

- [ ] **Step 5: Replace global styles**

In `apps/web/src/styles.css`, keep `@import "tailwindcss";` and base font rules, but remove old `.panel`, `.primary-button`, `.timeline-row`, etc. Add:

```css
@layer base {
  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    font-family:
      Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #fafaf9;
  }

  button,
  textarea,
  input,
  select {
    font: inherit;
  }

  button {
    cursor: pointer;
  }

  button:disabled {
    cursor: not-allowed;
  }
}

@layer utilities {
  .sr-table-header {
    @apply bg-stone-100 text-xs font-semibold uppercase tracking-wide text-stone-500;
  }

  .sr-scrollbar {
    scrollbar-color: #d6d3d1 transparent;
    scrollbar-width: thin;
  }
}
```

- [ ] **Step 6: Run web type-check**

Run:

```bash
pnpm --filter @signal-recycler/web type-check
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components apps/web/src/styles.css
git commit -m "feat(web): add owned-session shell primitives"
```

## Task 4: Add Data Hook And Top-Level Routing

**Files:**

- Create: `apps/web/src/hooks/useDashboardData.ts`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Create dashboard data hook**

Create `apps/web/src/hooks/useDashboardData.ts`:

```ts
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MemoryRecord, SessionRecord, TimelineEvent } from "@signal-recycler/shared";
import { fetchConfig, listFirehose, listMemories, listSessions, type ApiConfig } from "../api";

const POLL_INTERVAL_MS = 1500;

export function useDashboardData() {
  const [config, setConfig] = useState<ApiConfig | null>(null);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [nextConfig, nextSessions, nextEvents, nextMemories] = await Promise.all([
      fetchConfig(),
      listSessions(),
      listFirehose(250),
      listMemories()
    ]);
    setConfig(nextConfig);
    setSessions(nextSessions);
    setEvents(nextEvents);
    setMemories(nextMemories);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function load() {
      try {
        await refresh();
        if (cancelled) return;
        setLoading(false);
        interval = setInterval(() => {
          void refresh().catch((refreshError) => setError((refreshError as Error).message));
        }, POLL_INTERVAL_MS);
      } catch (loadError) {
        if (!cancelled) {
          setError((loadError as Error).message);
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [refresh]);

  const eventsBySession = useMemo(() => {
    const grouped = new Map<string, TimelineEvent[]>();
    for (const event of events) {
      grouped.set(event.sessionId, [...(grouped.get(event.sessionId) ?? []), event]);
    }
    return grouped;
  }, [events]);

  return {
    config,
    sessions,
    events,
    eventsBySession,
    memories,
    loading,
    error,
    setError,
    refresh
  };
}
```

- [ ] **Step 2: Replace `App.tsx` with route shell**

Replace `apps/web/src/App.tsx` with a compiling skeleton that routes to placeholder content first:

```tsx
import { useMemo, useState } from "react";
import type { AgentAdapter, SessionRecord } from "@signal-recycler/shared";
import { AppShell } from "./components/AppShell";
import { Button } from "./components/Button";
import { createSession, runSession } from "./api";
import { useDashboardData } from "./hooks/useDashboardData";
import type { AppRoute } from "./types";

export function App() {
  const data = useDashboardData();
  const [route, setRoute] = useState<AppRoute>("dashboard");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const counts = useMemo(
    () => ({
      sessions: data.sessions.length,
      memory: data.memories.length,
      context: undefined,
      evals: undefined
    }),
    [data.memories.length, data.sessions.length]
  );

  async function handleNewSession(prompt: string, adapter: AgentAdapter) {
    const session = await createSession(prompt.slice(0, 80) || undefined);
    setSelectedSessionId(session.id);
    setRoute("session");
    setNewSessionOpen(false);
    await runSession(session.id, prompt, adapter);
    await data.refresh();
  }

  const selectedSession = data.sessions.find((session) => session.id === selectedSessionId) ?? data.sessions[0] ?? null;

  return (
    <AppShell
      config={data.config}
      route={route}
      counts={counts}
      onRouteChange={setRoute}
      onNewSession={() => setNewSessionOpen(true)}
    >
      <section className="p-6">
        {data.error ? <ErrorBanner message={data.error} onDismiss={() => data.setError(null)} /> : null}
        {data.loading ? <div className="text-sm text-stone-500">Loading Signal Recycler…</div> : null}
        {!data.loading ? (
          <Placeholder route={route} selectedSession={selectedSession} onRouteChange={setRoute} />
        ) : null}
      </section>
      {newSessionOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/20 p-4">
          <form
            className="w-full max-w-xl rounded-lg border border-stone-200 bg-white p-4 shadow-xl"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const prompt = String(form.get("prompt") ?? "");
              const adapter = String(form.get("adapter") ?? "default") as AgentAdapter;
              void handleNewSession(prompt, adapter);
            }}
          >
            <h2 className="text-lg font-semibold">New session</h2>
            <textarea name="prompt" required className="mt-4 min-h-32 w-full rounded-md border border-stone-300 p-3 text-sm" placeholder="What should the agent do?" />
            <select name="adapter" className="mt-3 w-full rounded-md border border-stone-300 p-2 text-sm" defaultValue="default">
              <option value="default">Auto adapter</option>
              <option value="mock">Mock</option>
              <option value="codex_cli">Codex CLI</option>
              <option value="codex_sdk">Codex SDK</option>
            </select>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" onClick={() => setNewSessionOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary">Run session</Button>
            </div>
          </form>
        </div>
      ) : null}
    </AppShell>
  );
}

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="mb-4 flex items-start justify-between rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      <span className="break-all">{message}</span>
      <button className="ml-3 font-semibold" onClick={onDismiss}>Dismiss</button>
    </div>
  );
}

function Placeholder({
  route,
  selectedSession,
  onRouteChange
}: {
  route: AppRoute;
  selectedSession: SessionRecord | null;
  onRouteChange: (route: AppRoute) => void;
}) {
  if (route === "session") {
    return <div>Session detail placeholder: {selectedSession?.title ?? "No session selected"}</div>;
  }
  return (
    <div className="rounded-md border border-dashed border-stone-300 bg-white p-8 text-sm text-stone-500">
      {route} view placeholder.
      <button className="ml-2 underline" onClick={() => onRouteChange("sessions")}>Open sessions</button>
    </div>
  );
}
```

- [ ] **Step 3: Run type-check**

Run:

```bash
pnpm --filter @signal-recycler/web type-check
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/hooks/useDashboardData.ts
git commit -m "feat(web): add shell routing and dashboard data hook"
```

## Task 5: Build Dashboard And Sessions Views

**Files:**

- Create: `apps/web/src/views/DashboardView.tsx`
- Create: `apps/web/src/views/SessionsView.tsx`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Create dashboard overview**

Create `apps/web/src/views/DashboardView.tsx`:

```tsx
import type { MemoryRecord, SessionRecord, TimelineEvent } from "@signal-recycler/shared";
import { Badge } from "../components/Badge";
import { MetricTile } from "../components/MetricTile";
import { buildDashboardMetrics, summarizeSession } from "../lib/sessionPresenters";

export function DashboardView({
  sessions,
  events,
  eventsBySession,
  memories,
  onOpenSession,
  onOpenMemory
}: {
  sessions: SessionRecord[];
  events: TimelineEvent[];
  eventsBySession: Map<string, TimelineEvent[]>;
  memories: MemoryRecord[];
  onOpenSession: (sessionId: string) => void;
  onOpenMemory: () => void;
}) {
  const metrics = buildDashboardMetrics({ sessions, events, memories });
  const recentSessions = sessions.slice(0, 5).map((session) =>
    summarizeSession(session, eventsBySession.get(session.id) ?? [])
  );
  const pending = memories.filter((memory) => memory.status === "pending").slice(0, 3);
  const contextEvents = events
    .filter((event) => ["memory_retrieval", "memory_injection", "compression_result"].includes(event.category))
    .slice(0, 4);

  return (
    <div className="space-y-5 p-6">
      <div className="grid gap-3 xl:grid-cols-4">
        <MetricTile label="Active sessions" value={metrics.activeSessions} detail="owned runs in progress" />
        <MetricTile label="Memory" value={metrics.approvedMemory} detail={`${metrics.pendingMemory} pending review`} />
        <MetricTile label="Indexed" value="Preview" detail="source indexing lands in Phase 5" />
        <MetricTile label="Last eval" value="Read-only" detail="connect latest eval report in this phase" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-md border border-stone-200 bg-white">
          <div className="flex items-center justify-between border-b border-stone-200 p-4">
            <h2 className="font-semibold">Recent sessions</h2>
            <button className="text-sm text-stone-500" onClick={() => recentSessions[0] && onOpenSession(recentSessions[0].session.id)}>View latest</button>
          </div>
          <div className="divide-y divide-stone-100">
            {recentSessions.map((summary) => (
              <button key={summary.session.id} className="grid w-full grid-cols-[140px_minmax(0,1fr)_80px_80px] gap-3 px-4 py-3 text-left text-sm hover:bg-stone-50" onClick={() => onOpenSession(summary.session.id)}>
                <Badge tone={summary.status === "failed" ? "red" : summary.status === "needs_review" ? "amber" : "green"}>{summary.status.replace("_", " ")}</Badge>
                <div className="min-w-0">
                  <div className="truncate font-medium">{summary.title}</div>
                  <div className="truncate font-mono text-xs text-stone-400">{summary.session.id}</div>
                </div>
                <div className="text-stone-500">{summary.durationLabel}</div>
                <div className="font-mono text-green-700">{summary.tokenDelta}</div>
              </button>
            ))}
          </div>
        </section>
        <aside className="space-y-5">
          <section className="rounded-md border border-stone-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Memory review queue</h2>
              <Badge tone="amber">{pending.length} pending</Badge>
            </div>
            <div className="space-y-3">
              {pending.length === 0 ? <p className="text-sm text-stone-500">No pending memory.</p> : null}
              {pending.map((memory) => (
                <button key={memory.id} className="w-full rounded-md border border-amber-200 bg-amber-50 p-3 text-left text-sm" onClick={onOpenMemory}>
                  <div className="font-mono text-xs text-amber-800">{memory.id}</div>
                  <div className="mt-1">{memory.rule}</div>
                </button>
              ))}
            </div>
          </section>
          <section className="rounded-md border border-stone-200 bg-white p-4">
            <h2 className="mb-3 font-semibold">Recent context activity</h2>
            <div className="space-y-2 text-sm text-stone-600">
              {contextEvents.map((event) => (
                <div key={event.id} className="grid grid-cols-[48px_minmax(0,1fr)] gap-2">
                  <span className="font-mono text-xs text-stone-400">{new Date(event.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  <span className="truncate">{event.title}</span>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create sessions list**

Create `apps/web/src/views/SessionsView.tsx`:

```tsx
import { useMemo, useState } from "react";
import type { SessionRecord, TimelineEvent } from "@signal-recycler/shared";
import { Badge } from "../components/Badge";
import { summarizeSession } from "../lib/sessionPresenters";

const filters = ["all", "running", "needs_review", "done", "failed"] as const;

export function SessionsView({
  sessions,
  eventsBySession,
  onOpenSession
}: {
  sessions: SessionRecord[];
  eventsBySession: Map<string, TimelineEvent[]>;
  onOpenSession: (sessionId: string) => void;
}) {
  const [filter, setFilter] = useState<(typeof filters)[number]>("all");
  const [search, setSearch] = useState("");
  const summaries = useMemo(
    () => sessions.map((session) => summarizeSession(session, eventsBySession.get(session.id) ?? [])),
    [eventsBySession, sessions]
  );
  const visible = summaries.filter((summary) => {
    if (filter !== "all" && summary.status !== filter) return false;
    return `${summary.title} ${summary.session.id} ${summary.adapter}`.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {filters.map((item) => (
            <button key={item} className={`rounded-full px-3 py-1 text-sm ${filter === item ? "bg-stone-950 text-white" : "bg-stone-100 text-stone-600"}`} onClick={() => setFilter(item)}>
              {item.replace("_", " ")}
            </button>
          ))}
        </div>
        <input className="h-9 w-80 rounded-md border border-stone-200 px-3 text-sm" placeholder="Filter by prompt, agent, branch..." value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>
      <section className="overflow-hidden rounded-md border border-stone-200 bg-white">
        <div className="sr-table-header grid grid-cols-[minmax(0,1fr)_120px_100px_90px_90px_90px] gap-4 px-4 py-2">
          <span>Prompt</span><span>Agent</span><span>Duration</span><span>Mem in</span><span>New mem</span><span>Delta</span>
        </div>
        <div className="divide-y divide-stone-100">
          {visible.map((summary) => (
            <button key={summary.session.id} className="grid w-full grid-cols-[minmax(0,1fr)_120px_100px_90px_90px_90px] gap-4 px-4 py-3 text-left text-sm hover:bg-stone-50" onClick={() => onOpenSession(summary.session.id)}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge tone={summary.status === "failed" ? "red" : summary.status === "needs_review" ? "amber" : "green"}>{summary.status.replace("_", " ")}</Badge>
                  <span className="truncate font-medium">{summary.title}</span>
                </div>
                <div className="mt-1 font-mono text-xs text-stone-400">{summary.session.id}</div>
              </div>
              <span>{summary.adapter}</span>
              <span>{summary.durationLabel}</span>
              <span className="font-mono">{summary.memoryIn}</span>
              <span className="font-mono text-amber-700">{summary.newMemory || "-"}</span>
              <span className="font-mono text-green-700">{summary.tokenDelta}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Wire views in `App.tsx`**

Import:

```tsx
import { DashboardView } from "./views/DashboardView";
import { SessionsView } from "./views/SessionsView";
```

Replace `Placeholder` usage with:

```tsx
{route === "dashboard" ? (
  <DashboardView
    sessions={data.sessions}
    events={data.events}
    eventsBySession={data.eventsBySession}
    memories={data.memories}
    onOpenSession={(id) => {
      setSelectedSessionId(id);
      setRoute("session");
    }}
    onOpenMemory={() => setRoute("memory")}
  />
) : null}
{route === "sessions" ? (
  <SessionsView
    sessions={data.sessions}
    eventsBySession={data.eventsBySession}
    onOpenSession={(id) => {
      setSelectedSessionId(id);
      setRoute("session");
    }}
  />
) : null}
{route !== "dashboard" && route !== "sessions" ? (
  <Placeholder route={route} selectedSession={selectedSession} onRouteChange={setRoute} />
) : null}
```

- [ ] **Step 4: Run type-check**

```bash
pnpm --filter @signal-recycler/web type-check
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/views/DashboardView.tsx apps/web/src/views/SessionsView.tsx
git commit -m "feat(web): add dashboard and sessions views"
```

## Task 6: Build Session Detail, Timeline, And Inspector

**Files:**

- Create: `apps/web/src/components/InspectorPanel.tsx`
- Create: `apps/web/src/components/Timeline.tsx`
- Create: `apps/web/src/views/SessionDetailView.tsx`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Create inspector shell**

Create `apps/web/src/components/InspectorPanel.tsx`:

```tsx
import type { InspectorSelection } from "../types";
import { Badge } from "./Badge";

export function InspectorPanel({
  selection,
  onClose
}: {
  selection: InspectorSelection;
  onClose?: () => void;
}) {
  return (
    <aside className="sr-scrollbar h-full overflow-auto border-l border-stone-200 bg-white">
      <div className="flex items-start justify-between border-b border-stone-200 p-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-stone-400">Inspector</div>
          <h2 className="mt-1 font-semibold">{selectionTitle(selection)}</h2>
        </div>
        {onClose ? <button onClick={onClose}>Close</button> : null}
      </div>
      <div className="space-y-5 p-4 text-sm">
        {selection.type === "empty" ? <p className="text-stone-500">Select an event or memory to inspect provenance and metadata.</p> : null}
        {selection.type === "event" ? (
          <>
            <section>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">Event</div>
              <p className="font-medium">{selection.event.title}</p>
              <p className="mt-2 whitespace-pre-wrap text-stone-700">{selection.event.body}</p>
            </section>
            <section>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">Metadata</div>
              <pre className="overflow-auto rounded bg-stone-950 p-3 text-xs text-stone-100">{JSON.stringify(selection.event.metadata, null, 2)}</pre>
            </section>
          </>
        ) : null}
        {selection.type === "memory" ? (
          <>
            <section>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">Memory</div>
              <div className="flex flex-wrap gap-2">
                <Badge tone={selection.memory.status === "approved" ? "green" : selection.memory.status === "pending" ? "amber" : "red"}>{selection.memory.status}</Badge>
                <Badge>{selection.memory.memoryType}</Badge>
              </div>
              <p className="mt-3 text-stone-900">{selection.memory.rule}</p>
              <p className="mt-2 text-stone-500">{selection.memory.reason}</p>
            </section>
            <section>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">Properties</div>
              <dl className="grid grid-cols-[100px_minmax(0,1fr)] gap-2">
                <dt className="text-stone-500">Scope</dt><dd className="font-mono">{selection.memory.scope.value ?? selection.memory.scope.type}</dd>
                <dt className="text-stone-500">Confidence</dt><dd>{selection.memory.confidence}</dd>
                <dt className="text-stone-500">Last used</dt><dd>{selection.memory.lastUsedAt ?? "never"}</dd>
              </dl>
            </section>
          </>
        ) : null}
      </div>
    </aside>
  );
}

function selectionTitle(selection: InspectorSelection): string {
  if (selection.type === "event") return selection.event.category.replace("_", " ");
  if (selection.type === "memory") return selection.memory.id;
  if (selection.type === "session") return selection.session.title;
  return "Nothing selected";
}
```

- [ ] **Step 2: Create grouped timeline**

Create `apps/web/src/components/Timeline.tsx`:

```tsx
import type { TimelineEvent } from "@signal-recycler/shared";
import { Badge } from "./Badge";
import { eventTone, groupTimelineEvents } from "../lib/eventPresenters";
import { formatDateTime } from "../lib/format";

export function Timeline({
  events,
  selectedEventId,
  onSelectEvent
}: {
  events: TimelineEvent[];
  selectedEventId: string | null;
  onSelectEvent: (event: TimelineEvent) => void;
}) {
  const groups = groupTimelineEvents(events);
  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.id}>
          <div className="mb-3 flex items-center gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400">{group.title}</h3>
            <div className="h-px flex-1 bg-stone-200" />
            <span className="font-mono text-xs text-stone-400">{group.events.length}</span>
          </div>
          <div className="space-y-1">
            {group.events.map((event) => (
              <button
                key={event.id}
                className={`grid w-full grid-cols-[80px_28px_minmax(0,1fr)] gap-3 border-l-2 px-3 py-3 text-left text-sm ${selectedEventId === event.id ? "border-amber-500 bg-amber-50" : "border-transparent hover:bg-stone-50"}`}
                onClick={() => onSelectEvent(event)}
              >
                <span className="font-mono text-xs text-stone-400">{formatDateTime(event.createdAt)}</span>
                <span className="mt-1 size-4 rounded-full bg-stone-200" />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <strong>{event.title}</strong>
                    <Badge tone={eventTone(event.category)}>{event.category.replace("_", " ")}</Badge>
                  </span>
                  <span className="mt-1 block truncate text-stone-600">{event.body}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create session detail view**

Create `apps/web/src/views/SessionDetailView.tsx`:

```tsx
import { useMemo, useState } from "react";
import type { MemoryRecord, SessionRecord, TimelineEvent } from "@signal-recycler/shared";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { InspectorPanel } from "../components/InspectorPanel";
import { MetricTile } from "../components/MetricTile";
import { Timeline } from "../components/Timeline";
import { summarizeSession } from "../lib/sessionPresenters";
import type { InspectorSelection } from "../types";

export function SessionDetailView({
  session,
  events,
  memories,
  onBack
}: {
  session: SessionRecord | null;
  events: TimelineEvent[];
  memories: MemoryRecord[];
  onBack: () => void;
}) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(events[0]?.id ?? null);
  const [tab, setTab] = useState<"timeline" | "context" | "diff" | "candidates">("timeline");
  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? null;
  const selection: InspectorSelection = selectedEvent ? { type: "event", event: selectedEvent } : { type: "empty" };
  const summary = useMemo(() => (session ? summarizeSession(session, events) : null), [events, session]);
  const retrievalEvents = events.filter((event) => event.category === "memory_retrieval");
  const injectionEvents = events.filter((event) => event.category === "memory_injection");
  const candidateEvents = events.filter((event) => event.category === "rule_candidate");

  if (!session || !summary) {
    return <div className="p-6 text-sm text-stone-500">No session selected.</div>;
  }

  return (
    <div className="grid h-[calc(100vh-3.5rem)] grid-rows-[auto_minmax(0,1fr)]">
      <header className="border-b border-stone-200 bg-white">
        <div className="flex items-start justify-between gap-4 px-6 py-4">
          <div className="min-w-0">
            <button className="mb-2 text-sm text-stone-500" onClick={onBack}>‹ Sessions</button>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold">{session.title}</h1>
              <Badge>{session.id}</Badge>
              <Badge tone={summary.status === "failed" ? "red" : summary.status === "needs_review" ? "amber" : "green"}>{summary.status.replace("_", " ")}</Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-4 text-sm text-stone-500">
              <span>adapter <span className="font-mono text-stone-900">{summary.adapter}</span></span>
              <span>started <span className="font-mono text-stone-900">{new Date(session.createdAt).toLocaleString()}</span></span>
              <span>duration <span className="font-mono text-stone-900">{summary.durationLabel}</span></span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button disabled>Compare</Button>
            <Button disabled>Replay</Button>
            <Button variant="danger" disabled>Abort</Button>
          </div>
        </div>
        <div className="grid grid-cols-2 border-t border-stone-200 md:grid-cols-5">
          <MetricTile label="Memories injected" value={summary.memoryIn} />
          <MetricTile label="Retrieval events" value={retrievalEvents.length} />
          <MetricTile label="New memory" value={candidateEvents.length} detail={candidateEvents.length ? "pending review" : "none"} />
          <MetricTile label="Token delta" value={summary.tokenDelta} />
          <MetricTile label="Events" value={summary.eventCount} />
        </div>
        <nav className="flex gap-1 border-t border-stone-200 px-6">
          {[
            ["timeline", `Timeline ${events.length}`],
            ["context", `Context envelope ${retrievalEvents.length + injectionEvents.length}`],
            ["diff", "Diff preview"],
            ["candidates", `Memory candidates ${candidateEvents.length}`]
          ].map(([id, label]) => (
            <button key={id} className={`border-b-2 px-3 py-3 text-sm ${tab === id ? "border-amber-500 font-semibold" : "border-transparent text-stone-500"}`} onClick={() => setTab(id as typeof tab)}>
              {label}
            </button>
          ))}
        </nav>
      </header>
      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_390px]">
        <section className="sr-scrollbar min-h-0 overflow-auto p-6">
          {tab === "timeline" ? <Timeline events={events} selectedEventId={selectedEventId} onSelectEvent={(event) => setSelectedEventId(event.id)} /> : null}
          {tab === "context" ? <ContextEnvelopePreview events={events} /> : null}
          {tab === "diff" ? <PreviewEmpty title="Diff preview" body="File diff rendering will connect once owned sessions capture file-change artifacts." /> : null}
          {tab === "candidates" ? <CandidateList events={candidateEvents} /> : null}
        </section>
        <InspectorPanel selection={selection} />
      </div>
    </div>
  );
}

function ContextEnvelopePreview({ events }: { events: TimelineEvent[] }) {
  const relevant = events.filter((event) => event.category === "memory_retrieval" || event.category === "memory_injection" || event.category === "compression_result");
  if (relevant.length === 0) return <PreviewEmpty title="No context envelope yet" body="Run a session to see retrieval, skipped memories, injections, and compression decisions." />;
  return (
    <div className="space-y-3">
      {relevant.map((event) => (
        <pre key={event.id} className="overflow-auto rounded-md border border-stone-200 bg-white p-4 text-xs">{JSON.stringify({ title: event.title, body: event.body, metadata: event.metadata }, null, 2)}</pre>
      ))}
    </div>
  );
}

function CandidateList({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) return <PreviewEmpty title="No memory candidates" body="Post-run distillation has not produced pending memory for this session." />;
  return <div className="space-y-3">{events.map((event) => <div key={event.id} className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm">{event.body}</div>)}</div>;
}

function PreviewEmpty({ title, body }: { title: string; body: string }) {
  return <div className="rounded-md border border-dashed border-stone-300 bg-white p-8"><h2 className="font-semibold">{title}</h2><p className="mt-2 text-sm text-stone-500">{body}</p></div>;
}
```

- [ ] **Step 4: Wire in `App.tsx`**

Import:

```tsx
import { SessionDetailView } from "./views/SessionDetailView";
```

Replace the session placeholder with:

```tsx
{route === "session" ? (
  <SessionDetailView
    session={selectedSession}
    events={selectedSession ? data.eventsBySession.get(selectedSession.id) ?? [] : []}
    memories={data.memories}
    onBack={() => setRoute("sessions")}
  />
) : null}
```

Ensure the fallback placeholder excludes `"session"`:

```tsx
{!["dashboard", "sessions", "session"].includes(route) ? (
  <Placeholder route={route} selectedSession={selectedSession} onRouteChange={setRoute} />
) : null}
```

- [ ] **Step 5: Run type-check**

```bash
pnpm --filter @signal-recycler/web type-check
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/components/InspectorPanel.tsx apps/web/src/components/Timeline.tsx apps/web/src/views/SessionDetailView.tsx
git commit -m "feat(web): add session detail timeline"
```

## Task 7: Build Memory View With Audit Inspector

**Files:**

- Create: `apps/web/src/views/MemoryView.tsx`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Create memory table and inspector view**

Create `apps/web/src/views/MemoryView.tsx`:

```tsx
import { useMemo, useState } from "react";
import type { MemoryRecord } from "@signal-recycler/shared";
import { approveRule, rejectRule } from "../api";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { InspectorPanel } from "../components/InspectorPanel";
import { confidenceValue, countMemoriesByStatus, memoryScopeLabel, memorySourceLabel } from "../lib/memoryPresenters";
import type { InspectorSelection } from "../types";

const filters = ["all", "approved", "pending", "superseded", "rejected"] as const;

export function MemoryView({
  memories,
  onChanged
}: {
  memories: MemoryRecord[];
  onChanged: () => Promise<void>;
}) {
  const [filter, setFilter] = useState<(typeof filters)[number]>("all");
  const [selectedId, setSelectedId] = useState<string | null>(memories[0]?.id ?? null);
  const selected = memories.find((memory) => memory.id === selectedId) ?? null;
  const counts = countMemoriesByStatus(memories);
  const visible = useMemo(
    () => memories.filter((memory) => filter === "all" || (filter === "superseded" ? Boolean(memory.supersededBy) : memory.status === filter)),
    [filter, memories]
  );
  const selection: InspectorSelection = selected ? { type: "memory", memory: selected } : { type: "empty" };

  async function act(action: "approve" | "reject") {
    if (!selected) return;
    if (action === "approve") await approveRule(selected.id);
    else await rejectRule(selected.id);
    await onChanged();
  }

  return (
    <div className="grid h-[calc(100vh-3.5rem)] grid-cols-[minmax(0,1fr)_390px]">
      <section className="min-w-0 p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            {filters.map((item) => (
              <button key={item} className={`rounded-full px-3 py-1 text-sm ${filter === item ? "bg-stone-950 text-white" : "bg-stone-100 text-stone-600"}`} onClick={() => setFilter(item)}>
                {item} {counts[item] ?? ""}
              </button>
            ))}
          </div>
          <div className="text-sm text-stone-500">Memory review</div>
        </div>
        <section className="overflow-hidden rounded-md border border-stone-200 bg-white">
          <div className="sr-table-header grid grid-cols-[100px_minmax(0,1fr)_120px_150px_80px_80px_120px_120px] gap-4 px-4 py-2">
            <span>Status</span><span>Memory</span><span>Type</span><span>Scope</span><span>Conf</span><span>Used</span><span>Source</span><span>Last used</span>
          </div>
          <div className="divide-y divide-stone-100">
            {visible.map((memory) => (
              <button key={memory.id} className={`grid w-full grid-cols-[100px_minmax(0,1fr)_120px_150px_80px_80px_120px_120px] gap-4 px-4 py-3 text-left text-sm ${selected?.id === memory.id ? "bg-amber-50" : "hover:bg-stone-50"}`} onClick={() => setSelectedId(memory.id)}>
                <Badge tone={memory.status === "approved" ? "green" : memory.status === "pending" ? "amber" : "red"}>{memory.status}</Badge>
                <span className="min-w-0"><span className="font-mono text-xs text-stone-400">{memory.id}</span> {memory.rule}</span>
                <Badge>{memory.memoryType}</Badge>
                <span className="truncate font-mono text-xs">{memoryScopeLabel(memory)}</span>
                <span className="font-mono">{confidenceValue(memory).toFixed(2)}</span>
                <span className="font-mono">{memory.lastUsedAt ? "used" : "0"}</span>
                <Badge>{memorySourceLabel(memory.source)}</Badge>
                <span className="text-stone-500">{memory.lastUsedAt ?? "never"}</span>
              </button>
            ))}
          </div>
        </section>
      </section>
      <div className="grid grid-rows-[minmax(0,1fr)_auto]">
        <InspectorPanel selection={selection} />
        <div className="flex gap-2 border-l border-t border-stone-200 bg-white p-3">
          <Button disabled={!selected || selected.status === "approved"} variant="primary" onClick={() => void act("approve")}>Approve</Button>
          <Button disabled={!selected || selected.status === "rejected"} onClick={() => void act("reject")}>Reject</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire Memory view**

In `apps/web/src/App.tsx`, import:

```tsx
import { MemoryView } from "./views/MemoryView";
```

Add route rendering:

```tsx
{route === "memory" ? (
  <MemoryView memories={data.memories} onChanged={data.refresh} />
) : null}
```

Update the placeholder exclusion to include `"memory"`.

- [ ] **Step 3: Run type-check**

```bash
pnpm --filter @signal-recycler/web type-check
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/views/MemoryView.tsx
git commit -m "feat(web): add memory review view"
```

## Task 8: Add Context Index And Evals Preview Views

**Files:**

- Create: `apps/web/src/views/ContextIndexView.tsx`
- Create: `apps/web/src/views/EvalsView.tsx`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Create honest Context Index preview**

Create `apps/web/src/views/ContextIndexView.tsx`:

```tsx
import { useState } from "react";
import type { MemoryRetrievalPreview } from "../api";
import { previewMemoryRetrieval } from "../api";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";

export function ContextIndexView() {
  const [prompt, setPrompt] = useState("");
  const [preview, setPreview] = useState<MemoryRetrievalPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runPreview() {
    setError(null);
    try {
      setPreview(await previewMemoryRetrieval({ prompt, limit: 5 }));
    } catch (previewError) {
      setError((previewError as Error).message);
    }
  }

  return (
    <div className="space-y-5 p-6">
      <section className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Context Index is a Phase 5 surface. This preview uses the implemented memory retrieval layer only; source chunks, embeddings, cosine scores, and rerankers are intentionally hidden until they exist.
      </section>
      <section className="rounded-md border border-stone-200 bg-white">
        <div className="border-b border-stone-200 p-4">
          <h1 className="font-semibold">Retrieval preview</h1>
          <p className="mt-1 text-sm text-stone-500">Type a prompt to see which approved memories would be selected or skipped.</p>
        </div>
        <div className="flex gap-2 p-4">
          <input className="h-10 flex-1 rounded-md border border-stone-300 px-3 text-sm" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="how do we run validation in this repo?" />
          <Button disabled={!prompt.trim()} variant="primary" onClick={() => void runPreview()}>Preview</Button>
        </div>
        {error ? <div className="mx-4 mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
        {preview ? (
          <div className="border-t border-stone-200 p-4">
            <div className="mb-3 flex gap-2">
              <Badge tone="blue">Selected {preview.metrics.selectedMemories}</Badge>
              <Badge>Skipped {preview.metrics.skippedMemories}</Badge>
              <Badge>Approved {preview.metrics.approvedMemories}</Badge>
            </div>
            <pre className="overflow-auto rounded bg-stone-950 p-4 text-xs text-stone-100">{JSON.stringify(preview, null, 2)}</pre>
          </div>
        ) : null}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Create honest Evals read-only placeholder**

Create `apps/web/src/views/EvalsView.tsx`:

```tsx
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";

export function EvalsView() {
  return (
    <div className="space-y-5 p-6">
      <section className="rounded-md border border-stone-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-semibold">Evals</h1>
            <p className="mt-1 text-sm text-stone-500">Read-only eval report UI will connect to the latest local eval output once a stable endpoint is available.</p>
          </div>
          <Button disabled>Run all</Button>
        </div>
      </section>
      <section className="rounded-md border border-dashed border-stone-300 bg-white p-8">
        <Badge tone="amber">Preview</Badge>
        <h2 className="mt-3 font-semibold">No eval report endpoint connected</h2>
        <p className="mt-2 max-w-2xl text-sm text-stone-500">
          The target design compares without-memory and with-memory results, token delta, latency delta, precision/recall, and stale memory failures. Phase 4.5 should only show those values when backed by real eval report data.
        </p>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Wire preview views**

In `apps/web/src/App.tsx`, import:

```tsx
import { ContextIndexView } from "./views/ContextIndexView";
import { EvalsView } from "./views/EvalsView";
```

Add route rendering:

```tsx
{route === "context" ? <ContextIndexView /> : null}
{route === "evals" ? <EvalsView /> : null}
```

Update placeholder exclusion to include `"context"` and `"evals"`.

- [ ] **Step 4: Run type-check**

```bash
pnpm --filter @signal-recycler/web type-check
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/views/ContextIndexView.tsx apps/web/src/views/EvalsView.tsx
git commit -m "feat(web): add context and eval preview views"
```

## Task 9: Final UI Wiring, Browser Smoke, And PR Notes

**Files:**

- Modify: `apps/web/src/App.tsx`
- Modify: `docs/pr-notes/phase-4-5-ui-design-review-guide.md` or create implementation-specific review guide if this work is moved to a new branch.
- Modify: `docs/pr-notes/phase-4-5-ui-design-follow-up-backlog.md` or create implementation-specific backlog if this work is moved to a new branch.

- [ ] **Step 1: Remove obsolete hackathon UI code**

Confirm `apps/web/src/App.tsx` no longer contains:

```txt
Codex traffic
Run end-to-end demo
Use from your terminal
Approved memory side panel from the old layout
```

If those strings remain, remove the old JSX and unused imports.

- [ ] **Step 2: Run full verification**

Run:

```bash
pnpm --filter @signal-recycler/web test
pnpm --filter @signal-recycler/web type-check
pnpm test
pnpm type-check
pnpm build
```

Expected:

- Web tests pass.
- Type-check passes across packages.
- Full tests pass.
- Build passes.

- [ ] **Step 3: Run local browser smoke**

Start the app:

```bash
SIGNAL_RECYCLER_MOCK_CODEX=1 pnpm dev
```

Open:

```txt
http://127.0.0.1:5173/
```

Manual checks:

- Dashboard renders the new shell, not the old Codex traffic demo.
- Sessions navigation opens the sessions table.
- New session can run with the mock adapter or default adapter.
- Session Detail shows grouped events after a run.
- Context Envelope tab shows retrieval/injection/compression metadata when events exist.
- Memory page shows table and inspector.
- Context Index page labels itself as preview and uses memory retrieval only.
- Evals page labels itself as read-only/preview.
- Long errors stay inside the inspector or error banner and do not overflow across columns.

- [ ] **Step 4: Update PR review guide**

If implementing on this same branch, update `docs/pr-notes/phase-4-5-ui-design-review-guide.md` with an implementation section:

```md
## Implementation Change Map

- Web app shell and navigation.
- Dashboard overview.
- Sessions table.
- Session detail timeline and inspector.
- Memory table and inspector.
- Context retrieval preview.
- Evals preview.

## Verification Results

- `pnpm --filter @signal-recycler/web test`: pass
- `pnpm --filter @signal-recycler/web type-check`: pass
- `pnpm test`: pass
- `pnpm type-check`: pass
- `pnpm build`: pass
- Browser smoke with `SIGNAL_RECYCLER_MOCK_CODEX=1 pnpm dev`: pass
```

- [ ] **Step 5: Update follow-up backlog**

Add concrete residual risks:

```md
## P1: Real Eval Report Endpoint

Residual risk: Evals UI is read-only/preview until a backend endpoint exposes latest eval reports.

Next action: add `GET /api/evals/latest` backed by `.signal-recycler/evals/latest.json`.

## P1: Responsive Inspector Polish

Residual risk: desktop inspector exists, but mobile drawer behavior may need additional browser testing.

Next action: add responsive viewport smoke for Session Detail and Memory.
```

- [ ] **Step 6: Commit final verification docs**

```bash
git add docs/pr-notes apps/web/src
git commit -m "docs: add phase 4.5 ui verification notes"
```

## Plan Self-Review

- Spec coverage:
  - App shell: Tasks 3 and 4.
  - Dashboard overview: Task 5.
  - Sessions list: Task 5.
  - Session Detail: Task 6.
  - Context envelope visibility: Task 6.
  - Memory review and provenance: Task 7.
  - Context Index preview: Task 8.
  - Evals preview/read-only stance: Task 8.
  - Hybrid data strategy: Tasks 5 through 8 use real data first and preview labels for unsupported surfaces.
- Placeholder scan:
  - The plan intentionally uses "preview" for unsupported product surfaces. It does not use TBD/TODO implementation placeholders.
- Type consistency:
  - `AppRoute`, `InspectorSelection`, `SessionSummary`, and presenter helper names are defined before use.
  - API helper names match imports in later tasks.
- Scope:
  - The plan does not implement Phase 5 source indexing, vector retrieval, cloud sync, real compare/replay, or Claude Code runtime support.
