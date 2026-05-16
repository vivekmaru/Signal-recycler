import { useEffect, useMemo, useRef, useState } from "react";
import type { ContextIndexStatus, ContextSourceType } from "@signal-recycler/shared";
import type { ContextRetrievalPreview } from "../api";
import { fetchContextIndexStatus, reindexContextIndex, retrieveContextIndex } from "../api";
import { Badge, type BadgeTone } from "../components/Badge";
import { Button } from "../components/Button";
import {
  buildContextCoverageRows,
  buildContextRetrievalPreview,
  contextIndexMetrics,
  sourceTypeLabel
} from "../lib/contextIndexPresenters";

const sourceTypeFilters = [
  "docs",
  "agent_instructions",
  "package",
  "source",
  "config",
  "tests"
] satisfies ContextSourceType[];

type SubmittedPreview = {
  prompt: string;
  result: ContextRetrievalPreview;
};

export function ContextIndexView() {
  const [status, setStatus] = useState<ContextIndexStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [reindexing, setReindexing] = useState(false);
  const [reindexError, setReindexError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [selectedSourceTypes, setSelectedSourceTypes] = useState<ContextSourceType[]>([]);
  const [preview, setPreview] = useState<SubmittedPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const statusRequestIdRef = useRef(0);
  const requestIdRef = useRef(0);
  const promptRef = useRef("");
  const sourceFilterKey = selectedSourceTypes.join(",");
  const sourceFilterRef = useRef(sourceFilterKey);
  sourceFilterRef.current = sourceFilterKey;

  useEffect(() => {
    let cancelled = false;
    const statusRequestId = statusRequestIdRef.current + 1;
    statusRequestIdRef.current = statusRequestId;
    setStatusLoading(true);
    setStatusError(null);

    fetchContextIndexStatus()
      .then((result) => {
        if (!cancelled && statusRequestIdRef.current === statusRequestId) setStatus(result);
      })
      .catch((error: unknown) => {
        if (!cancelled && statusRequestIdRef.current === statusRequestId) {
          setStatusError(errorMessage(error, "Context index status failed."));
        }
      })
      .finally(() => {
        if (!cancelled && statusRequestIdRef.current === statusRequestId) setStatusLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setPreviewError(null);
    if (!preview) return;
    if (prompt.trim() !== preview.prompt) setPreview(null);
  }, [preview, prompt]);

  useEffect(() => {
    sourceFilterRef.current = sourceFilterKey;
    requestIdRef.current += 1;
    setPreview(null);
    setPreviewError(null);
    setPreviewLoading(false);
  }, [sourceFilterKey]);

  const coverageRows = useMemo(() => (status ? buildContextCoverageRows(status) : []), [status]);
  const metrics = useMemo(() => (status ? contextIndexMetrics(status) : []), [status]);
  const previewRows = useMemo(() => (preview ? buildContextRetrievalPreview(preview.result) : null), [preview]);
  const hasPrompt = prompt.trim().length > 0;
  const hasIndex = (status?.totalChunks ?? 0) > 0;

  function handlePromptChange(nextPrompt: string) {
    setPrompt(nextPrompt);
    promptRef.current = nextPrompt;
  }

  function toggleSourceType(sourceType: ContextSourceType) {
    setSelectedSourceTypes((current) =>
      current.includes(sourceType) ? current.filter((item) => item !== sourceType) : [...current, sourceType]
    );
  }

  async function runReindex() {
    if (reindexing) return;
    statusRequestIdRef.current += 1;
    requestIdRef.current += 1;
    setReindexing(true);
    setReindexError(null);
    setStatusError(null);
    setPreview(null);
    setPreviewError(null);
    setPreviewLoading(false);

    try {
      const result = await reindexContextIndex();
      setStatus(result);
    } catch (error: unknown) {
      setReindexError(errorMessage(error, "Context index reindex failed."));
    } finally {
      setReindexing(false);
      setStatusLoading(false);
    }
  }

  async function runPreview() {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || previewLoading || !hasIndex) return;

    const requestId = requestIdRef.current + 1;
    const sourceFilterSnapshot = sourceFilterRef.current;
    requestIdRef.current = requestId;
    setPreviewError(null);
    setPreview(null);
    setPreviewLoading(true);

    try {
      const result = await retrieveContextIndex({
        prompt: trimmedPrompt,
        limit: 5,
        ...(selectedSourceTypes.length > 0 ? { sourceTypes: selectedSourceTypes } : {})
      });
      if (
        requestIdRef.current === requestId &&
        promptRef.current.trim() === trimmedPrompt &&
        sourceFilterRef.current === sourceFilterSnapshot
      ) {
        setPreview({ prompt: trimmedPrompt, result });
      }
    } catch (error: unknown) {
      if (requestIdRef.current === requestId && sourceFilterRef.current === sourceFilterSnapshot) {
        setPreview(null);
        setPreviewError(errorMessage(error, "Context retrieval preview failed."));
      }
    } finally {
      if (requestIdRef.current === requestId) setPreviewLoading(false);
    }
  }

  return (
    <div className="min-w-[720px] space-y-4">
      <section className="rounded-md border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="blue">Phase 5</Badge>
              <h1 className="text-base font-semibold text-stone-950">Context Index</h1>
            </div>
            <p className="mt-2 max-w-5xl text-sm leading-6 text-stone-600">
              Index and inspect repository docs, agent instruction files, package files, config, tests, and selected
              source chunks. These chunks are separate from durable memory and are not yet injected into owned-session
              context envelopes.
            </p>
          </div>
          <Button disabled={reindexing} onClick={() => void runReindex()} variant="primary">
            {reindexing ? "Reindexing..." : "Reindex"}
          </Button>
        </div>

        {statusError ? <ErrorBox message={statusError} title="Context index unavailable" /> : null}
        {reindexError ? <ErrorBox message={reindexError} title="Reindex failed" /> : null}
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        {statusLoading && !status
          ? ["Files", "Chunks", "Sources", "Last indexed"].map((label) => (
              <MetricSkeleton key={label} label={label} />
            ))
          : metrics.map((metric) => (
              <MetricCard key={metric.label} label={metric.label} tone={metric.tone} value={metric.value} />
            ))}
      </section>

      <section className="rounded-md border border-stone-200 bg-white">
        <div className="border-b border-stone-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-stone-950">Coverage</h2>
              <p className="mt-1 text-sm text-stone-500">
                Current local index contents by source type for {status?.workdir ?? "the configured workdir"}.
              </p>
            </div>
            {status ? <Badge tone={hasIndex ? "green" : "amber"}>{hasIndex ? "indexed" : "empty"}</Badge> : null}
          </div>
        </div>

        {status && coverageRows.length > 0 ? (
          <div className="divide-y divide-stone-100">
            {coverageRows.map((row) => (
              <div className="grid gap-3 p-4 sm:grid-cols-[160px_96px_96px_minmax(160px,1fr)]" key={row.id}>
                <div className="font-medium text-stone-950">{row.label}</div>
                <div className="font-mono text-sm text-stone-600">{row.files}</div>
                <div className="font-mono text-sm text-stone-600">{row.chunks}</div>
                <div className="flex min-w-0 items-center gap-3">
                  <div className="h-2 min-w-0 flex-1 rounded-full bg-stone-100">
                    <div className="h-2 rounded-full bg-amber-500" style={{ width: `${row.percent}%` }} />
                  </div>
                  <span className="w-10 text-right font-mono text-xs text-stone-500">{row.percent}%</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 text-sm text-stone-500">
            {statusError
              ? "Context index status is unavailable. Check the error above, then retry status or reindex."
              : statusLoading
                ? "Loading context index status..."
                : "No source context is indexed yet. Run reindex to scan this workdir."}
          </div>
        )}
      </section>

      <section className="rounded-md border border-stone-200 bg-white">
        <div className="border-b border-stone-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-stone-950">Source Retrieval Preview</h2>
              <p className="mt-1 text-sm text-stone-500">
                Enter a prompt to inspect which indexed source/doc chunks would be retrieved.
              </p>
            </div>
            <Badge title="Request limit">limit 5</Badge>
          </div>
        </div>

        <div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">Prompt</span>
            <input
              className="h-10 w-full min-w-0 rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
              onChange={(event) => handlePromptChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void runPreview();
              }}
              placeholder="Where is auth middleware handled?"
              value={prompt}
            />
          </label>
          <Button disabled={!hasPrompt || previewLoading || !hasIndex} onClick={() => void runPreview()} variant="primary">
            {previewLoading ? "Retrieving..." : "Preview"}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 px-4 pb-4">
          {sourceTypeFilters.map((sourceType) => {
            const selected = selectedSourceTypes.includes(sourceType);
            return (
              <button
                aria-pressed={selected}
                className={`h-8 rounded-md border px-3 text-sm ${
                  selected
                    ? "border-stone-950 bg-stone-950 text-white"
                    : "border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100"
                }`}
                key={sourceType}
                onClick={() => toggleSourceType(sourceType)}
                type="button"
              >
                {sourceTypeLabel(sourceType)}
              </button>
            );
          })}
        </div>

        {previewError ? <ErrorBox message={previewError} title="Retrieval failed" /> : null}

        {previewRows ? (
          <div className="border-t border-stone-200 p-4">
            <div className="mb-3 rounded-md border border-stone-200 bg-stone-50 p-3 text-xs text-stone-600">
              Preview generated for <span className="font-mono text-stone-950">{preview?.prompt}</span>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              {previewRows.metrics.map((metric) => (
                <Badge key={metric.label} tone={metric.tone}>
                  {metric.label} {metric.value}
                </Badge>
              ))}
            </div>
            {previewRows.selectedRows.length > 0 ? (
              <div className="overflow-x-auto rounded-md border border-stone-200">
                <div className="min-w-[880px] divide-y divide-stone-100">
                  {previewRows.selectedRows.map((row) => (
                    <div className="grid grid-cols-[64px_minmax(280px,1fr)_128px_96px] gap-4 p-3 text-sm" key={row.id}>
                      <span className="font-mono text-stone-500">#{row.rank}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-stone-950">{row.title}</span>
                        <span className="mt-1 block text-xs text-stone-500">{row.detail}</span>
                        <span className="mt-1 block truncate text-xs text-stone-500">{row.reason}</span>
                      </span>
                      <span className="font-mono text-xs text-stone-500">{row.hash.slice(0, 12)}</span>
                      <span className="text-right font-mono text-sm text-stone-700">{row.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-stone-200 bg-stone-50 p-4 text-sm text-stone-500">
                No indexed chunks matched this prompt.
              </div>
            )}
          </div>
        ) : (
          <div className="border-t border-stone-200 p-4 text-sm text-stone-500">
            {hasIndex
              ? "No source retrieval preview has been requested yet."
              : "Index this workdir before running source retrieval previews."}
          </div>
        )}
      </section>
    </div>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone: BadgeTone }) {
  return (
    <div className="rounded-md border border-stone-200 bg-white p-4">
      <div className="mb-2">
        <Badge tone={tone}>{label}</Badge>
      </div>
      <div className="font-mono text-2xl font-semibold text-stone-950">{value}</div>
    </div>
  );
}

function MetricSkeleton({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-stone-200 bg-white p-4">
      <div className="mb-2">
        <Badge>{label}</Badge>
      </div>
      <div className="font-mono text-sm text-stone-400">loading</div>
    </div>
  );
}

function ErrorBox({ title, message }: { title: string; message: string }) {
  return (
    <div className="mx-4 mb-4 mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      <div className="font-semibold">{title}</div>
      <div className="mt-1 break-words font-mono text-xs">{message}</div>
    </div>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
