import type { TimelineEvent } from "@signal-recycler/shared";
import { eventTone, groupTimelineEvents } from "../lib/eventPresenters";
import { formatDateTime } from "../lib/format";
import { Badge } from "./Badge";

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

  if (events.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-stone-300 bg-white p-8 text-sm text-stone-500">
        No timeline events have been recorded for this session yet.
      </div>
    );
  }

  return (
    <div className="space-y-7">
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
                aria-pressed={selectedEventId === event.id}
                className={`grid w-full grid-cols-[72px_18px_minmax(0,1fr)] gap-3 border-l-2 px-3 py-3 text-left text-sm transition ${
                  selectedEventId === event.id
                    ? "border-amber-500 bg-amber-50"
                    : "border-transparent bg-white hover:bg-stone-50"
                }`}
                key={event.id}
                onClick={() => onSelectEvent(event)}
                type="button"
              >
                <span className="pt-1 font-mono text-xs text-stone-400">{formatDateTime(event.createdAt)}</span>
                <span className={`mt-1.5 size-3 rounded-full ${dotClass(event.category)}`} />
                <span className="min-w-0">
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <strong className="truncate text-stone-950">{event.title}</strong>
                    <Badge tone={eventTone(event.category)}>{event.category.replaceAll("_", " ")}</Badge>
                  </span>
                  {event.body ? (
                    <span className="mt-1 block truncate text-stone-600">{event.body}</span>
                  ) : (
                    <span className="mt-1 block text-stone-400">No event body recorded.</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function dotClass(category: TimelineEvent["category"]): string {
  if (category === "memory_retrieval" || category === "memory_injection") return "bg-sky-500";
  if (category === "rule_candidate") return "bg-amber-500";
  if (category === "rule_auto_approved" || category === "compression_result") return "bg-green-500";
  return "bg-stone-300";
}
