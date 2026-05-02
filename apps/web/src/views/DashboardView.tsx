import type { MemoryRecord, SessionRecord, TimelineEvent } from "@signal-recycler/shared";
import { Badge, type BadgeTone } from "../components/Badge";
import { Button } from "../components/Button";
import { MetricTile } from "../components/MetricTile";
import { formatDateTime, formatTokenDelta } from "../lib/format";
import { memoryScopeLabel, memorySourceLabel } from "../lib/memoryPresenters";
import { buildDashboardMetrics, summarizeSession } from "../lib/sessionPresenters";
import type { SessionSummary } from "../types";

const contextCategories = new Set(["memory_retrieval", "memory_injection", "compression_result"]);

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
  const recentSessions = [...sessions]
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, 5)
    .map((session) => summarizeSession(session, eventsBySession.get(session.id) ?? []));
  const pendingMemories = memories
    .filter((memory) => memory.status === "pending")
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, 4);
  const contextEvents = events
    .filter((event) => contextCategories.has(event.category))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, 6);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-stone-950">Owned-session control plane</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-500">
            Live sessions, memory provenance, and context activity from the local Signal Recycler runtime.
          </p>
        </div>
        <Badge tone="green">local source of truth</Badge>
      </header>

      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Active sessions" value={metrics.activeSessions} detail={`${sessions.length} total sessions`} />
        <MetricTile
          label="Approved memory"
          value={metrics.approvedMemory}
          detail={`${metrics.pendingMemory} pending review`}
        />
        <MetricTile
          label="Context activity"
          value={metrics.recentContextEvents}
          detail="retrieval, injection, compression events"
        />
        <MetricTile label="Index and evals" value="Preview" detail="read-only placeholders; no fake indexing data">
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone="blue">context index preview</Badge>
            <Badge tone="purple">evals read-only</Badge>
          </div>
        </MetricTile>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0 overflow-hidden rounded-md border border-stone-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-stone-200 p-4">
            <div className="min-w-0">
              <h2 className="font-semibold text-stone-950">Recent sessions</h2>
              <p className="mt-1 text-xs text-stone-500">Operational status from recorded timeline events.</p>
            </div>
            <Button
              disabled={recentSessions.length === 0}
              onClick={() => recentSessions[0] && onOpenSession(recentSessions[0].session.id)}
              variant="ghost"
            >
              Open latest
            </Button>
          </div>
          {recentSessions.length === 0 ? (
            <EmptyState>No sessions have been created for this project yet.</EmptyState>
          ) : (
            <div className="divide-y divide-stone-100">
              {recentSessions.map((summary) => (
                <SessionRow key={summary.session.id} onOpenSession={onOpenSession} summary={summary} />
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-5">
          <section className="rounded-md border border-stone-200 bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-stone-200 p-4">
              <div>
                <h2 className="font-semibold text-stone-950">Memory review queue</h2>
                <p className="mt-1 text-xs text-stone-500">Pending durable memory from real records.</p>
              </div>
              <Badge tone="amber">{metrics.pendingMemory} pending</Badge>
            </div>
            {pendingMemories.length === 0 ? (
              <EmptyState>No pending memory records.</EmptyState>
            ) : (
              <div className="divide-y divide-stone-100">
                {pendingMemories.map((memory) => (
                  <button
                    className="block w-full px-4 py-3 text-left text-sm hover:bg-stone-50"
                    key={memory.id}
                    onClick={onOpenMemory}
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Badge tone="amber">{memory.memoryType}</Badge>
                      <span className="shrink-0 font-mono text-xs text-stone-400">{formatDateTime(memory.createdAt)}</span>
                    </div>
                    <div className="mt-2 line-clamp-2 text-stone-900">{memory.rule}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-stone-500">
                      <span className="truncate">{memoryScopeLabel(memory)}</span>
                      <span className="truncate">{memorySourceLabel(memory.source)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-md border border-stone-200 bg-white">
            <div className="border-b border-stone-200 p-4">
              <h2 className="font-semibold text-stone-950">Recent context activity</h2>
              <p className="mt-1 text-xs text-stone-500">Recorded retrieval, injection, and compression events.</p>
            </div>
            {contextEvents.length === 0 ? (
              <EmptyState>No context events recorded yet.</EmptyState>
            ) : (
              <div className="divide-y divide-stone-100">
                {contextEvents.map((event) => (
                  <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 px-4 py-3 text-sm" key={event.id}>
                    <span className="font-mono text-xs text-stone-400">{formatDateTime(event.createdAt)}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge tone="blue">{event.category.replace("_", " ")}</Badge>
                      </div>
                      <div className="mt-1 truncate font-medium text-stone-900">{event.title}</div>
                      <div className="mt-1 truncate text-xs text-stone-500">{event.sessionId}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function SessionRow({
  summary,
  onOpenSession
}: {
  summary: SessionSummary;
  onOpenSession: (sessionId: string) => void;
}) {
  return (
    <button
      className="grid w-full grid-cols-[minmax(0,1fr)_96px_86px_86px] gap-4 px-4 py-3 text-left text-sm hover:bg-stone-50"
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
      <div className="text-stone-600">{summary.adapter}</div>
      <div className="font-mono text-stone-600">{summary.durationLabel}</div>
      <div className="font-mono text-green-700">{formatTokenDelta(summary.tokenDelta)}</div>
    </button>
  );
}

function StatusBadge({ status }: { status: SessionSummary["status"] }) {
  const tone: BadgeTone =
    status === "failed" ? "red" : status === "needs_review" ? "amber" : status === "running" ? "blue" : "green";
  return <Badge tone={tone}>{status.replace("_", " ")}</Badge>;
}

function EmptyState({ children }: { children: string }) {
  return <div className="p-6 text-sm text-stone-500">{children}</div>;
}
