import { useRef, useState } from "react";
import type { MemoryRetrievalPreview } from "../api";
import { previewMemoryRetrieval } from "../api";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";

type SubmittedPreview = {
  prompt: string;
  result: MemoryRetrievalPreview;
};

export function ContextIndexView() {
  const [prompt, setPrompt] = useState("");
  const [preview, setPreview] = useState<SubmittedPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);
  const promptRef = useRef("");

  function handlePromptChange(nextPrompt: string) {
    setPrompt(nextPrompt);
    promptRef.current = nextPrompt;

    const trimmedPrompt = nextPrompt.trim();
    if (preview && trimmedPrompt !== preview.prompt) {
      setPreview(null);
    }
  }

  async function runPreview() {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || loading) return;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setError(null);
    setPreview(null);
    setLoading(true);

    try {
      const result = await previewMemoryRetrieval({ prompt: trimmedPrompt, limit: 5 });
      if (requestIdRef.current === requestId && promptRef.current.trim() === trimmedPrompt) {
        setPreview({ prompt: trimmedPrompt, result });
      }
    } catch (previewError: unknown) {
      if (requestIdRef.current === requestId) {
        setPreview(null);
        setError(errorMessage(previewError));
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }

  const hasPrompt = prompt.trim().length > 0;

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="amber">Phase 5 surface</Badge>
          <span className="font-semibold">Context Index preview</span>
        </div>
        <p className="mt-2 max-w-5xl">
          This screen previews the implemented memory retrieval layer only. It does not show or claim source
          chunks, embeddings, vector retrieval, cosine scores, or reranking.
        </p>
      </section>

      <section className="rounded-md border border-stone-200 bg-white">
        <div className="border-b border-stone-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-base font-semibold text-stone-950">Retrieval Preview</h1>
              <p className="mt-1 text-sm text-stone-500">
                Enter a prompt to inspect which approved memories would be selected or skipped.
              </p>
            </div>
            <Badge title="Request limit">limit 5</Badge>
          </div>
        </div>

        <div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">
              Prompt
            </span>
            <input
              className="h-10 w-full min-w-0 rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
              onChange={(event) => handlePromptChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void runPreview();
              }}
              placeholder="How do we run validation in this repo?"
              value={prompt}
            />
          </label>
          <Button disabled={!hasPrompt || loading} onClick={() => void runPreview()} variant="primary">
            {loading ? "Previewing" : "Preview"}
          </Button>
        </div>

        {error ? (
          <div className="mx-4 mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {preview ? (
          <div className="border-t border-stone-200 p-4">
            <div className="mb-3 rounded-md border border-stone-200 bg-stone-50 p-3 text-xs text-stone-600">
              Preview generated for <span className="font-mono text-stone-950">{preview.prompt}</span>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              <Badge tone="blue">Selected {preview.result.metrics.selectedMemories}</Badge>
              <Badge>Skipped {preview.result.metrics.skippedMemories}</Badge>
              <Badge tone="green">Approved {preview.result.metrics.approvedMemories}</Badge>
              <Badge>Limit {preview.result.metrics.limit}</Badge>
            </div>
            <pre className="max-h-[520px] overflow-auto rounded-md bg-stone-950 p-4 text-xs leading-5 text-stone-100">
              {JSON.stringify(preview.result, null, 2)}
            </pre>
          </div>
        ) : (
          <div className="border-t border-stone-200 p-4 text-sm text-stone-500">
            No retrieval preview has been requested yet.
          </div>
        )}
      </section>
    </div>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Memory retrieval preview failed.";
}
