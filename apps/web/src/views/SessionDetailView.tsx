import { useEffect, useMemo, useState } from "react";
import { GitCompare, OctagonX, RotateCcw } from "lucide-react";
import type { MemoryRecord, SessionRecord, TimelineEvent } from "@signal-recycler/shared";
import { Badge, type BadgeTone } from "../components/Badge";
import { Button } from "../components/Button";
import { InspectorPanel } from "../components/InspectorPanel";
import { MetricTile } from "../components/MetricTile";
import { Timeline } from "../components/Timeline";
import { groupCandidateEvents, type CandidateEventGroup } from "../lib/eventPresenters";
import { formatDateTime, formatTokenDelta } from "../lib/format";
import { summarizeSession } from "../lib/sessionPresenters";
import type { InspectorSelection } from "../types";

type SessionTab = "timeline" | "context" | "diff" | "candidates";

const contextCategories = new Set<TimelineEvent["category"]>([
  "memory_retrieval",
  "memory_injection",
  "compression_result"
]);

export function SessionDetailView({
  session,
  events,
  eventsLoading,
  eventsError,
  memories,
  onBack,
  onRetryEvents
}: {
  session: SessionRecord | null;
  events: TimelineEvent[];
  eventsLoading: boolean;
  eventsError: string | null;
  memories: MemoryRecord[];
  onBack: () => void;
  onRetryEvents: () => void;
}) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(events[0]?.id ?? null);
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null);
  const [inspectorMode, setInspectorMode] = useState<"event" | "memory" | "session">("event");
  const [tab, setTab] = useState<SessionTab>("timeline");

  useEffect(() => {
    if (events.length === 0) {
      setSelectedEventId(null);
      setInspectorMode("session");
      return;
    }

    if (!selectedEventId || !events.some((event) => event.id === selectedEventId)) {
      setSelectedEventId(events[0]?.id ?? null);
      setInspectorMode("event");
    }
  }, [events, selectedEventId]);

  const summary = useMemo(() => (session ? summarizeSession(session, events) : null), [events, session]);
  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? null;
  const selectedMemory = memories.find((memory) => memory.id === selectedMemoryId) ?? null;
  const retrievalEvents = events.filter((event) => event.category === "memory_retrieval");
  const injectionEvents = events.filter((event) => event.category === "memory_injection");
  const contextEvents = events.filter((event) => contextCategories.has(event.category));
  const candidateGroups = groupCandidateEvents(events);
  const candidateEventCount = candidateGroups.reduce((count, group) => count + group.events.length, 0);
  const selection: InspectorSelection =
    inspectorMode === "memory" && selectedMemory
      ? { type: "memory", memory: selectedMemory }
      : inspectorMode === "event" && selectedEvent
        ? { type: "event", event: selectedEvent }
        : session
          ? { type: "session", session }
          : { type: "empty" };

  if (!session || !summary) {
    return (
      <div className="p-6">
        <div className="rounded-md border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-500">
          No session is selected yet. Open a session from the sessions list to inspect timeline and context
          envelope data.
          <div className="mt-4">
            <Button onClick={onBack}>Open sessions</Button>
          </div>
        </div>
      </div>
    );
  }

  if (eventsLoading || eventsError) {
    return (
      <SessionEventsState
        error={eventsError}
        loading={eventsLoading}
        onBack={onBack}
        onRetryEvents={onRetryEvents}
        session={session}
      />
    );
  }

  return (
    <div className="grid min-h-[calc(100vh-3.5rem)] grid-rows-[auto_minmax(0,1fr)]">
      <header className="border-b border-stone-200 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-4">
          <div className="min-w-0">
            <button className="mb-2 text-sm text-stone-500 hover:text-stone-950" onClick={onBack} type="button">
              Back to sessions
            </button>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold text-stone-950">{session.title}</h1>
              <Badge>{session.id}</Badge>
              <Badge tone={statusTone(summary.status)}>{summary.status.replaceAll("_", " ")}</Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-500">
              <span>
                adapter <span className="font-mono text-stone-900">{summary.adapter}</span>
              </span>
              <span>
                started <span className="font-mono text-stone-900">{formatDateTime(session.createdAt)}</span>
              </span>
              <span>
                duration <span className="font-mono text-stone-900">{summary.durationLabel}</span>
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled title="Compare is a preview until file-change artifacts are captured.">
              <GitCompare size={16} />
              Compare
            </Button>
            <Button disabled title="Replay is disabled until backed replay execution exists.">
              <RotateCcw size={16} />
              Replay
            </Button>
            <Button disabled title="Abort is disabled; no running-session abort API exists yet." variant="danger">
              <OctagonX size={16} />
              Abort
            </Button>
          </div>
        </div>
        <div className="grid gap-3 border-t border-stone-200 bg-stone-50 p-3 md:grid-cols-3 xl:grid-cols-6">
          <MetricTile label="Memories injected" value={summary.memoryIn} detail={`${injectionEvents.length} injection events`} />
          <MetricTile label="Retrieval events" value={retrievalEvents.length} detail="selected and skipped memory" />
          <MetricTile
            label="New memory"
            value={candidateGroups.length}
            detail={candidateEventCount ? `${candidateEventCount} candidate events` : "none"}
          />
          <MetricTile label="Token delta" value={formatTokenDelta(summary.tokenDelta)} detail="compression result events" />
          <MetricTile label="Events" value={summary.eventCount} detail={`${contextEvents.length} context events`} />
          <MetricTile label="Inspector" value={inspectorLabel(selection)} detail="selected record" />
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-stone-200 px-6" role="tablist">
          {[
            ["timeline", `Timeline ${events.length}`],
            ["context", `Context envelope ${contextEvents.length}`],
            ["diff", "Diff preview"],
            ["candidates", `Memory candidates ${candidateGroups.length}`]
          ].map(([id, label]) => (
            <button
              aria-controls={`session-tabpanel-${id}`}
              aria-selected={tab === id}
              className={`shrink-0 border-b-2 px-3 py-3 text-sm ${
                tab === id ? "border-amber-500 font-semibold text-stone-950" : "border-transparent text-stone-500"
              }`}
              id={`session-tab-${id}`}
              key={id}
              onClick={() => setTab(id as SessionTab)}
              role="tab"
              type="button"
            >
              {label}
            </button>
          ))}
        </nav>
      </header>
      <div className="grid min-h-0 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section
          aria-labelledby={`session-tab-${tab}`}
          className="sr-scrollbar min-h-0 overflow-auto p-6"
          id={`session-tabpanel-${tab}`}
          role="tabpanel"
        >
          {tab === "timeline" ? (
            <Timeline
              events={events}
              selectedEventId={inspectorMode === "event" ? selectedEventId : null}
              onSelectEvent={(event) => {
                setSelectedEventId(event.id);
                setSelectedMemoryId(null);
                setInspectorMode("event");
              }}
            />
          ) : null}
          {tab === "context" ? (
            <ContextEnvelopePreview
              events={contextEvents}
              onSelectEvent={(event) => {
                setSelectedEventId(event.id);
                setSelectedMemoryId(null);
                setInspectorMode("event");
              }}
            />
          ) : null}
          {tab === "diff" ? (
            <PreviewEmpty
              body="File diff rendering will connect only after owned sessions capture durable file-change artifacts."
              title="Diff preview"
            />
          ) : null}
          {tab === "candidates" ? (
            <CandidateList
              groups={candidateGroups}
              memories={memories}
              onSelectEvent={(event) => {
                setSelectedEventId(event.id);
                setSelectedMemoryId(null);
                setInspectorMode("event");
              }}
              onSelectMemory={(memoryId) => {
                setSelectedMemoryId(memoryId);
                setInspectorMode("memory");
              }}
            />
          ) : null}
        </section>
        <InspectorPanel selection={selection} />
      </div>
    </div>
  );
}

function SessionEventsState({
  session,
  loading,
  error,
  onBack,
  onRetryEvents
}: {
  session: SessionRecord;
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onRetryEvents: () => void;
}) {
  return (
    <div className="p-6">
      <button className="mb-4 text-sm text-stone-500 hover:text-stone-950" onClick={onBack} type="button">
        Back to sessions
      </button>
      <div className="rounded-md border border-stone-200 bg-white p-6">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h1 className="truncate text-xl font-semibold text-stone-950">{session.title}</h1>
          <Badge>{session.id}</Badge>
        </div>
        {loading ? (
          <p className="mt-4 text-sm leading-6 text-stone-500">
            Loading the complete event list for this session. Firehose summaries are intentionally not shown here
            as complete session history.
          </p>
        ) : (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <div className="font-semibold">Could not load complete session events.</div>
            <p className="mt-2 break-words">{error}</p>
            <Button className="mt-4" onClick={onRetryEvents}>
              Retry
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ContextEnvelopePreview({
  events,
  onSelectEvent
}: {
  events: TimelineEvent[];
  onSelectEvent: (event: TimelineEvent) => void;
}) {
  if (events.length === 0) {
    return (
      <PreviewEmpty
        body="Run a session with retrieval or compression to see selected memory, skipped memory, injection, and token decisions."
        title="No context envelope events"
      />
    );
  }

  return (
    <div className="space-y-3">
      {events.map((event) => (
        <button
          className="block w-full rounded-md border border-stone-200 bg-white p-4 text-left text-sm hover:bg-stone-50"
          key={event.id}
          onClick={() => onSelectEvent(event)}
          type="button"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Badge tone="blue">{event.category.replaceAll("_", " ")}</Badge>
              <strong className="truncate text-stone-950">{event.title}</strong>
            </div>
            <span className="font-mono text-xs text-stone-400">{formatDateTime(event.createdAt)}</span>
          </div>
          <p className="mt-2 text-stone-600">{event.body || "No event body recorded."}</p>
          <ContextMetadata event={event} />
        </button>
      ))}
    </div>
  );
}

function ContextMetadata({ event }: { event: TimelineEvent }) {
  if (event.category === "memory_retrieval") {
    const selected = metadataRecords(event.metadata["selected"]);
    const skipped = metadataRecords(event.metadata["skipped"]);
    const metrics = metadataRecord(event.metadata["metrics"]);

    return (
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <MetadataBlock label="Selected" value={String(selected.length)} />
        <MetadataBlock label="Skipped" value={String(skipped.length)} />
        <MetadataBlock label="Limit" value={metadataScalar(metrics["limit"]) ?? "unknown"} />
      </div>
    );
  }

  if (event.category === "memory_injection") {
    const memoryIds = metadataStrings(event.metadata["memoryIds"]);
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        {memoryIds.length === 0 ? (
          <span className="text-xs text-stone-500">No memory IDs recorded.</span>
        ) : (
          memoryIds.map((id) => <Badge key={id}>{id}</Badge>)
        )}
      </div>
    );
  }

  if (event.category === "compression_result") {
    return (
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <MetadataBlock label="Tokens removed" value={metadataScalar(event.metadata["tokensRemoved"]) ?? "unknown"} />
        <MetadataBlock label="Project" value={metadataScalar(event.metadata["projectId"]) ?? "unknown"} />
        <MetadataBlock label="Phase" value={metadataScalar(event.metadata["phase"]) ?? "not recorded"} />
      </div>
    );
  }

  return null;
}

function CandidateList({
  groups,
  memories,
  onSelectEvent,
  onSelectMemory
}: {
  groups: CandidateEventGroup[];
  memories: MemoryRecord[];
  onSelectEvent: (event: TimelineEvent) => void;
  onSelectMemory: (memoryId: string) => void;
}) {
  if (groups.length === 0) {
    return (
      <PreviewEmpty
        body="Post-run distillation has not produced pending or auto-approved memory for this session."
        title="No memory candidates"
      />
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const event = group.primaryEvent;
        const latestEvent = group.events.at(-1) ?? event;
        const memory = group.ruleId ? memories.find((item) => item.id === group.ruleId) : null;

        return (
          <article className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm" key={group.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {group.events.map((item) => (
                  <Badge key={item.id} tone={item.category === "rule_auto_approved" ? "green" : "amber"}>
                    {item.category.replaceAll("_", " ")}
                  </Badge>
                ))}
                {memory ? <Badge tone={memory.status === "approved" ? "green" : "amber"}>{memory.status}</Badge> : null}
              </div>
              <span className="font-mono text-xs text-amber-900/70">{formatDateTime(latestEvent.createdAt)}</span>
            </div>
            <p className="mt-3 whitespace-pre-wrap break-words font-medium leading-6 text-stone-950">{event.body}</p>
            <p className="mt-2 text-stone-700">{metadataScalar(event.metadata["reason"]) ?? "No candidate reason recorded."}</p>
            {group.events.length > 1 ? (
              <p className="mt-2 text-xs text-amber-900/70">
                Grouped {group.events.length} candidate lifecycle events for one durable rule.
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => onSelectEvent(event)} variant="secondary">
                Inspect event
              </Button>
              {memory ? (
                <Button onClick={() => onSelectMemory(memory.id)} variant="secondary">
                  Inspect memory
                </Button>
              ) : (
                <Button disabled title="No durable memory record is loaded for this candidate.">
                  Memory unavailable
                </Button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function PreviewEmpty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-dashed border-stone-300 bg-white p-8">
      <h2 className="font-semibold text-stone-950">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">{body}</p>
    </div>
  );
}

function MetadataBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</div>
      <div className="mt-1 truncate font-mono text-sm text-stone-900">{value}</div>
    </div>
  );
}

function statusTone(status: NonNullable<ReturnType<typeof summarizeSession>>["status"]): BadgeTone {
  if (status === "failed") return "red";
  if (status === "needs_review") return "amber";
  if (status === "running") return "blue";
  return "green";
}

function inspectorLabel(selection: InspectorSelection): string {
  if (selection.type === "event") return "Event";
  if (selection.type === "memory") return "Memory";
  if (selection.type === "session") return "Session";
  return "None";
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function metadataRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map(metadataRecord).filter((record) => Object.keys(record).length > 0) : [];
}

function metadataStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function metadataScalar(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}
