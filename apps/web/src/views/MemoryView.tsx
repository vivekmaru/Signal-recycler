import { useEffect, useMemo, useState } from "react";
import type { MemoryRecord, MemoryUsage } from "@signal-recycler/shared";
import { approveRule, fetchMemoryAudit, rejectRule, type MemoryAuditResult } from "../api";
import { Badge, type BadgeTone } from "../components/Badge";
import { Button } from "../components/Button";
import { InspectorPanel } from "../components/InspectorPanel";
import { formatDateTime } from "../lib/format";
import {
  confidenceValue,
  countMemoriesByStatus,
  memoryScopeLabel,
  memorySourceLabel,
  memoryStatusLabel,
  memoryTypeLabel
} from "../lib/memoryPresenters";
import type { InspectorSelection } from "../types";

const filters = ["all", "approved", "pending", "superseded", "rejected"] as const;
type MemoryFilter = (typeof filters)[number];

export function MemoryView({
  memories,
  onChanged
}: {
  memories: MemoryRecord[];
  onChanged: () => Promise<void>;
}) {
  const [filter, setFilter] = useState<MemoryFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(memories[0]?.id ?? null);
  const [audit, setAudit] = useState<MemoryAuditResult | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"approve" | "reject" | null>(null);

  const counts = useMemo(() => countMemoriesByStatus(memories), [memories]);
  const visible = useMemo(
    () =>
      [...memories]
        .filter((memory) => {
          if (filter === "all") return true;
          if (filter === "superseded") return Boolean(memory.supersededBy);
          return memory.status === filter && !memory.supersededBy;
        })
        .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)),
    [filter, memories]
  );
  const selected = visible.find((memory) => memory.id === selectedId) ?? visible[0] ?? null;
  const selectedIdForAudit = selected?.id ?? null;
  const actionsDisabled = !selected || pendingAction !== null || Boolean(selected.supersededBy);
  const selection: InspectorSelection = selected ? { type: "memory", memory: selected } : { type: "empty" };

  useEffect(() => {
    const nextSelectedId = visible[0]?.id ?? null;
    if (selectedId && visible.some((memory) => memory.id === selectedId)) return;
    setSelectedId(nextSelectedId);
  }, [selectedId, visible]);

  useEffect(() => {
    setActionError(null);
  }, [selectedIdForAudit]);

  useEffect(() => {
    if (!selectedIdForAudit) {
      setAudit(null);
      setAuditError(null);
      setAuditLoading(false);
      return;
    }

    let cancelled = false;
    setAudit(null);
    setAuditError(null);
    setAuditLoading(true);

    fetchMemoryAudit(selectedIdForAudit)
      .then((result) => {
        if (!cancelled) setAudit(result);
      })
      .catch((error: unknown) => {
        if (!cancelled) setAuditError(errorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setAuditLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedIdForAudit]);

  async function act(action: "approve" | "reject") {
    if (!selected || selected.supersededBy || pendingAction) return;
    setPendingAction(action);
    setActionError(null);

    try {
      if (action === "approve") await approveRule(selected.id);
      else await rejectRule(selected.id);
      await onChanged();
    } catch (error: unknown) {
      setActionError(errorMessage(error));
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="grid min-h-[calc(100vh-3.5rem)] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_390px]">
      <section className="min-w-0 space-y-4 p-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-stone-950">Memory review</h1>
            <p className="mt-1 text-sm text-stone-500">
              Durable memory records from the local Signal Recycler runtime.
            </p>
          </div>
          <div className="font-mono text-xs text-stone-500">
            showing {visible.length} / {memories.length}
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
                {item}
                <span className="ml-2 font-mono text-xs opacity-75">{counts[item]}</span>
              </button>
            ))}
          </div>
          <Badge tone="green">local memory store</Badge>
        </div>

        <section className="overflow-x-auto rounded-md border border-stone-200 bg-white">
          <div className="min-w-[1040px]">
            <div className="grid grid-cols-[112px_minmax(320px,1fr)_126px_170px_96px_156px_142px] gap-4 border-b border-stone-200 bg-stone-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
              <span>Status</span>
              <span>Memory</span>
              <span>Type</span>
              <span>Scope</span>
              <span>Conf</span>
              <span>Source</span>
              <span>Last used</span>
            </div>
            {visible.length === 0 ? (
              <div className="p-6 text-sm text-stone-500">No memory records match the current filter.</div>
            ) : (
              <div className="divide-y divide-stone-100">
                {visible.map((memory) => (
                  <MemoryTableRow
                    key={memory.id}
                    memory={memory}
                    onSelect={setSelectedId}
                    selected={selected?.id === memory.id}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </section>

      <aside className="grid min-h-[560px] min-w-0 grid-rows-[minmax(0,1fr)_auto_auto] border-t border-stone-200 xl:border-t-0">
        <InspectorPanel selection={selection} />
        <AuditPanel audit={audit} error={auditError} loading={auditLoading} selected={selected} />
        <div className="border-l border-t border-stone-200 bg-white p-3">
          {actionError ? (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">{actionError}</div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={actionsDisabled || selected?.status === "approved"}
              onClick={() => {
                void act("approve");
              }}
              variant="primary"
            >
              {pendingAction === "approve" ? "Approving..." : "Approve"}
            </Button>
            <Button
              disabled={actionsDisabled || selected?.status === "rejected"}
              onClick={() => {
                void act("reject");
              }}
              variant="danger"
            >
              {pendingAction === "reject" ? "Rejecting..." : "Reject"}
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function MemoryTableRow({
  memory,
  selected,
  onSelect
}: {
  memory: MemoryRecord;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      className={`grid w-full grid-cols-[112px_minmax(320px,1fr)_126px_170px_96px_156px_142px] gap-4 px-4 py-3 text-left text-sm ${
        selected ? "bg-amber-50" : "hover:bg-stone-50"
      }`}
      onClick={() => onSelect(memory.id)}
      type="button"
    >
      <span>
        <Badge tone={memoryStatusTone(memory)}>{memoryStatusLabel(memory)}</Badge>
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium text-stone-950">{memory.rule}</span>
        <span className="mt-1 block truncate font-mono text-xs text-stone-400">{memory.id}</span>
      </span>
      <span>
        <Badge>{memoryTypeLabel(memory)}</Badge>
      </span>
      <span className="truncate font-mono text-xs text-stone-600">{memoryScopeLabel(memory)}</span>
      <span className="font-mono text-stone-700">{confidenceValue(memory).toFixed(2)}</span>
      <span className="truncate text-xs text-stone-600">{memorySourceLabel(memory.source)}</span>
      <span className="font-mono text-xs text-stone-500">
        {memory.lastUsedAt ? formatDateTime(memory.lastUsedAt) : "never"}
      </span>
    </button>
  );
}

function AuditPanel({
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
  return (
    <section className="max-h-80 overflow-auto border-l border-t border-stone-200 bg-white p-4 text-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-stone-950">Recorded usage audit</h2>
          <p className="mt-1 text-xs text-stone-500">Injection usages recorded for this memory in the local project.</p>
        </div>
        {audit ? <Badge>{audit.usages.length} uses</Badge> : null}
      </div>
      {!selected ? <div className="text-stone-500">Select a memory record to inspect usage audit data.</div> : null}
      {selected && loading ? <div className="text-stone-500">Loading audit data...</div> : null}
      {selected && error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">{error}</div>
      ) : null}
      {selected && !loading && !error && audit ? <UsageList usages={audit.usages} /> : null}
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

function memoryStatusTone(memory: MemoryRecord): BadgeTone {
  if (memory.supersededBy) return "purple";
  if (memory.status === "approved") return "green";
  if (memory.status === "pending") return "amber";
  return "red";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
