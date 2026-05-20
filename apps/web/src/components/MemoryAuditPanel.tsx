import type { MemoryRecord, MemoryUsage } from "@signal-recycler/shared";
import type { MemoryAuditResult } from "../api";
import { formatDateTime } from "../lib/format";
import { memoryAuditPanelState } from "../lib/memoryAuditPresenters";
import { Badge } from "./Badge";

export function MemoryAuditPanel({
  selected,
  audit,
  loading,
  error
}: {
  selected: MemoryRecord | null;
  audit: MemoryAuditResult | null;
  loading: boolean;
  error: string | null;
}) {
  const state = memoryAuditPanelState({ selected, audit, loading, error });

  return (
    <section className="max-h-80 overflow-auto border-l border-t border-stone-200 bg-white p-4 text-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-stone-950">Recorded usage audit</h2>
          <p className="mt-1 text-xs text-stone-500">Injection usages recorded for this memory in the local project.</p>
        </div>
        {state.status === "ready" ? <Badge>{state.usageCount} uses</Badge> : null}
      </div>
      {state.status === "empty" ? (
        <div className="text-stone-500">Select a memory record to inspect usage audit data.</div>
      ) : null}
      {state.status === "loading" ? <div className="text-stone-500">Loading audit data...</div> : null}
      {state.status === "error" ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">{state.message}</div>
      ) : null}
      {state.status === "ready" && audit ? <UsageList usages={audit.usages} /> : null}
    </section>
  );
}

function UsageList({ usages }: { usages: MemoryUsage[] }) {
  if (usages.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-stone-300 bg-stone-50 p-3 text-xs text-stone-500">
        No memory injection usage has been recorded for this memory.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {usages.map((usage) => (
        <div className="rounded-md border border-stone-200 bg-stone-50 p-3" key={usage.id}>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="blue">{usage.adapter}</Badge>
            <span className="font-mono text-xs text-stone-500">{formatDateTime(usage.injectedAt)}</span>
          </div>
          <dl className="mt-2 grid grid-cols-[72px_minmax(0,1fr)] gap-2 text-xs">
            <dt className="text-stone-500">Reason</dt>
            <dd className="truncate text-stone-800">{usage.reason}</dd>
            <dt className="text-stone-500">Session</dt>
            <dd className="truncate font-mono text-stone-800">{usage.sessionId}</dd>
            <dt className="text-stone-500">Event</dt>
            <dd className="truncate font-mono text-stone-800">{usage.eventId}</dd>
          </dl>
        </div>
      ))}
    </div>
  );
}
