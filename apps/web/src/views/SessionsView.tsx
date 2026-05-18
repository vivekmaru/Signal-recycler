import { useMemo, useState } from "react";
import type { MemoryRecord, SessionRecord, TimelineEvent } from "@signal-recycler/shared";
import { Badge, type BadgeTone } from "../components/Badge";
import { formatDateTime, formatTokenDelta } from "../lib/format";
import { summarizeSession } from "../lib/sessionPresenters";
import type { SessionStatus, SessionSummary } from "../types";

const filters = ["all", "running", "needs_review", "done", "failed"] as const;
type SessionFilter = (typeof filters)[number];

export function SessionsView({
  sessions,
  eventsBySession,
  memories,
  onOpenSession
}: {
  sessions: SessionRecord[];
  eventsBySession: Map<string, TimelineEvent[]>;
  memories: MemoryRecord[];
  onOpenSession: (sessionId: string) => void;
}) {
  const [filter, setFilter] = useState<SessionFilter>("all");
  const [search, setSearch] = useState("");

  const summaries = useMemo(
    () =>
      [...sessions]
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
        .map((session) => summarizeSession(session, eventsBySession.get(session.id) ?? [], memories)),
    [eventsBySession, memories, sessions]
  );
  const statusCounts = useMemo(() => countStatuses(summaries), [summaries]);
  const normalizedSearch = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      summaries.filter((summary) => {
        if (filter !== "all" && summary.status !== filter) return false;
        if (!normalizedSearch) return true;
        const haystack = [
          summary.title,
          summary.session.id,
          summary.adapter,
          summary.status,
          summary.session.projectId
        ].join(" ");
        return haystack.toLowerCase().includes(normalizedSearch);
      }),
    [filter, normalizedSearch, summaries]
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-stone-950">Sessions</h1>
          <p className="mt-1 text-sm text-stone-500">Dense owned-session inventory from local runtime records.</p>
        </div>
        <div className="font-mono text-xs text-stone-500">
          showing {visible.length} / {summaries.length}
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-stone-200 bg-white p-3">
        <div className="flex flex-wrap gap-2">
          {filters.map((item) => (
            <button
              aria-pressed={filter === item}
              className={`h-8 rounded-md border px-3 text-sm ${
                filter === item
                  ? "border-stone-950 bg-stone-950 text-white"
                  : "border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100"
              }`}
              key={item}
              onClick={() => setFilter(item)}
              type="button"
            >
              {item.replace("_", " ")}
              <span className="ml-2 font-mono text-xs opacity-75">{item === "all" ? summaries.length : statusCounts[item]}</span>
            </button>
          ))}
        </div>
        <label className="min-w-[260px] flex-1 md:max-w-sm">
          <span className="sr-only">Search sessions</span>
          <input
            className="h-9 w-full rounded-md border border-stone-300 px-3 text-sm outline-none placeholder:text-stone-400 focus:border-stone-500"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title, session id, adapter, status"
            type="search"
            value={search}
          />
        </label>
      </div>

      <section className="overflow-x-auto rounded-md border border-stone-200 bg-white">
        <div className="min-w-[900px]">
          <div className="grid grid-cols-[minmax(260px,1fr)_112px_98px_78px_78px_82px_88px] gap-4 border-b border-stone-200 bg-stone-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
            <span>Session</span>
            <span>Adapter</span>
            <span>Started</span>
            <span>Duration</span>
            <span>Mem in</span>
            <span>New mem</span>
            <span>Delta</span>
          </div>
          {visible.length === 0 ? (
            <div className="p-6 text-sm text-stone-500">No sessions match the current filters.</div>
          ) : (
            <div className="divide-y divide-stone-100">
              {visible.map((summary) => (
                <SessionTableRow key={summary.session.id} onOpenSession={onOpenSession} summary={summary} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function SessionTableRow({
  summary,
  onOpenSession
}: {
  summary: SessionSummary;
  onOpenSession: (sessionId: string) => void;
}) {
  return (
    <button
      className="grid w-full grid-cols-[minmax(260px,1fr)_112px_98px_78px_78px_82px_88px] gap-4 px-4 py-3 text-left text-sm hover:bg-stone-50"
      onClick={() => onOpenSession(summary.session.id)}
      type="button"
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <StatusBadge status={summary.status} />
          <span className="truncate font-medium text-stone-950">{summary.title}</span>
        </div>
        <div className="mt-1 truncate font-mono text-xs text-stone-400">{summary.session.id}</div>
      </div>
      <span className="truncate text-stone-700">{summary.adapter}</span>
      <span className="font-mono text-xs text-stone-500">{formatDateTime(summary.startedAt)}</span>
      <span className="font-mono text-stone-700">{summary.durationLabel}</span>
      <span className="font-mono text-stone-700">{summary.memoryIn}</span>
      <span className="font-mono text-amber-700">{summary.newMemory || "-"}</span>
      <span className="font-mono text-green-700">{formatTokenDelta(summary.tokenDelta)}</span>
    </button>
  );
}

function StatusBadge({ status }: { status: SessionStatus }) {
  const tone: BadgeTone =
    status === "failed" ? "red" : status === "needs_review" ? "amber" : status === "running" ? "blue" : "green";
  return <Badge tone={tone}>{status.replace("_", " ")}</Badge>;
}

function countStatuses(summaries: SessionSummary[]): Record<SessionStatus, number> {
  return summaries.reduce<Record<SessionStatus, number>>(
    (counts, summary) => {
      counts[summary.status] += 1;
      return counts;
    },
    { running: 0, needs_review: 0, done: 0, failed: 0 }
  );
}
