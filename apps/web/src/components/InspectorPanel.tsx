import type { InspectorSelection } from "../types";
import { formatDateTime } from "../lib/format";
import { memoryScopeLabel, memorySourceLabel } from "../lib/memoryPresenters";
import { Badge, type BadgeTone } from "./Badge";
import { Button } from "./Button";

export function InspectorPanel({
  selection,
  onClose
}: {
  selection: InspectorSelection;
  onClose?: () => void;
}) {
  return (
    <aside className="sr-scrollbar h-full min-h-0 overflow-auto border-l border-stone-200 bg-white">
      <div className="flex items-start justify-between gap-3 border-b border-stone-200 p-4">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-stone-400">Inspector</div>
          <h2 className="mt-1 truncate font-semibold text-stone-950">{selectionTitle(selection)}</h2>
        </div>
        {onClose ? (
          <Button onClick={onClose} variant="ghost">
            Close
          </Button>
        ) : null}
      </div>
      <div className="space-y-5 p-4 text-sm">
        {selection.type === "empty" ? <EmptyInspector /> : null}
        {selection.type === "session" ? <SessionInspector selection={selection} /> : null}
        {selection.type === "event" ? <EventInspector selection={selection} /> : null}
        {selection.type === "memory" ? <MemoryInspector selection={selection} /> : null}
      </div>
    </aside>
  );
}

function EmptyInspector() {
  return (
    <section className="rounded-md border border-dashed border-stone-300 bg-stone-50 p-4 text-stone-500">
      Select a session, timeline event, or memory candidate to inspect recorded metadata. No replay, diff, or
      memory audit is loaded here until those backed features are implemented.
    </section>
  );
}

function SessionInspector({ selection }: { selection: Extract<InspectorSelection, { type: "session" }> }) {
  return (
    <>
      <section>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">Session</div>
        <p className="font-medium text-stone-950">{selection.session.title}</p>
        <dl className="mt-3 grid grid-cols-[88px_minmax(0,1fr)] gap-2 text-xs">
          <dt className="text-stone-500">ID</dt>
          <dd className="truncate font-mono text-stone-800">{selection.session.id}</dd>
          <dt className="text-stone-500">Project</dt>
          <dd className="truncate font-mono text-stone-800">{selection.session.projectId}</dd>
          <dt className="text-stone-500">Created</dt>
          <dd className="font-mono text-stone-800">{formatDateTime(selection.session.createdAt)}</dd>
        </dl>
      </section>
      <section className="rounded-md border border-dashed border-stone-300 bg-stone-50 p-4 text-stone-500">
        Select a timeline row to inspect event metadata, or a memory candidate to inspect its durable memory
        record when one exists.
      </section>
    </>
  );
}

function EventInspector({ selection }: { selection: Extract<InspectorSelection, { type: "event" }> }) {
  const metadataKeys = Object.keys(selection.event.metadata);

  return (
    <>
      <section>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">Event</div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="blue">{selection.event.category.replaceAll("_", " ")}</Badge>
          <Badge>{formatDateTime(selection.event.createdAt)}</Badge>
        </div>
        <p className="mt-3 font-medium text-stone-950">{selection.event.title}</p>
        {selection.event.body ? (
          <p className="mt-2 whitespace-pre-wrap break-words leading-6 text-stone-700">{selection.event.body}</p>
        ) : (
          <p className="mt-2 text-stone-500">This event has no body text.</p>
        )}
      </section>
      <section>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">Properties</div>
        <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 text-xs">
          <dt className="text-stone-500">Event ID</dt>
          <dd className="truncate font-mono text-stone-800">{selection.event.id}</dd>
          <dt className="text-stone-500">Session</dt>
          <dd className="truncate font-mono text-stone-800">{selection.event.sessionId}</dd>
        </dl>
      </section>
      <section>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">Metadata</div>
        {metadataKeys.length === 0 ? (
          <div className="rounded-md border border-dashed border-stone-300 bg-stone-50 p-3 text-stone-500">
            No metadata was recorded for this event.
          </div>
        ) : (
          <pre className="max-h-[420px] overflow-auto rounded-md bg-stone-950 p-3 text-xs leading-5 text-stone-100">
            {JSON.stringify(selection.event.metadata, null, 2)}
          </pre>
        )}
      </section>
    </>
  );
}

function MemoryInspector({ selection }: { selection: Extract<InspectorSelection, { type: "memory" }> }) {
  return (
    <>
      <section>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">Memory</div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={memoryStatusTone(selection.memory.status)}>{selection.memory.status}</Badge>
          <Badge>{selection.memory.memoryType.replaceAll("_", " ")}</Badge>
          <Badge>{selection.memory.syncStatus}</Badge>
        </div>
        <p className="mt-3 whitespace-pre-wrap break-words font-medium leading-6 text-stone-950">
          {selection.memory.rule}
        </p>
        <p className="mt-2 whitespace-pre-wrap break-words leading-6 text-stone-600">{selection.memory.reason}</p>
      </section>
      <section>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">Properties</div>
        <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-2 text-xs">
          <dt className="text-stone-500">ID</dt>
          <dd className="truncate font-mono text-stone-800">{selection.memory.id}</dd>
          <dt className="text-stone-500">Scope</dt>
          <dd className="truncate font-mono text-stone-800">{memoryScopeLabel(selection.memory)}</dd>
          <dt className="text-stone-500">Source</dt>
          <dd className="truncate text-stone-800">{memorySourceLabel(selection.memory.source)}</dd>
          <dt className="text-stone-500">Confidence</dt>
          <dd className="text-stone-800">{selection.memory.confidence}</dd>
          <dt className="text-stone-500">Last used</dt>
          <dd className="font-mono text-stone-800">{selection.memory.lastUsedAt ?? "never"}</dd>
        </dl>
      </section>
      <section className="rounded-md border border-dashed border-stone-300 bg-stone-50 p-4 text-stone-500">
        Usage audit history is not loaded in this session inspector. The memory review task will attach the full
        provenance/audit panel.
      </section>
    </>
  );
}

function selectionTitle(selection: InspectorSelection): string {
  if (selection.type === "event") return selection.event.title;
  if (selection.type === "memory") return selection.memory.id;
  if (selection.type === "session") return selection.session.title;
  return "Nothing selected";
}

function memoryStatusTone(status: Extract<InspectorSelection, { type: "memory" }>["memory"]["status"]): BadgeTone {
  if (status === "approved") return "green";
  if (status === "pending") return "amber";
  return "red";
}
