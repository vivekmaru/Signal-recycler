import { Badge } from "../components/Badge";
import { Button } from "../components/Button";

export function EvalsView() {
  return (
    <div className="space-y-4">
      <section className="rounded-md border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-base font-semibold text-stone-950">Evals</h1>
              <Badge tone="amber">Preview</Badge>
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-500">
              This is a read-only preview. No eval report endpoint is connected, so this screen does not
              display generated results.
            </p>
          </div>
          <Button disabled>Run all</Button>
        </div>
      </section>

      <section className="rounded-md border border-dashed border-stone-300 bg-white p-6">
        <Badge tone="amber">No connected endpoint</Badge>
        <h2 className="mt-3 text-sm font-semibold text-stone-950">No eval report data available</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-500">
          A future connected report can compare without-memory and with-memory runs, token delta, latency
          delta, precision/recall, and stale memory failures. Phase 4.5 should only show those values when
          backed by real local eval output.
        </p>
      </section>
    </div>
  );
}
