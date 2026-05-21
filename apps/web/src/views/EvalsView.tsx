import { useEffect, useMemo, useRef, useState } from "react";
import type { EvalReportSummary } from "@signal-recycler/shared";
import { fetchEvalReport } from "../api";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import {
  buildEvalMetricRows,
  buildEvalSuiteRows,
  evalReportGeneratedLabel,
  evalStatusTone,
  primaryEvalSuite
} from "../lib/evalPresenters";

export function EvalsView() {
  const [report, setReport] = useState<EvalReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    void refreshReport();
  }, []);

  async function refreshReport() {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);

    try {
      const result = await fetchEvalReport();
      if (requestIdRef.current === requestId) setReport(result);
    } catch (error: unknown) {
      if (requestIdRef.current === requestId) {
        setReport(null);
        setError(errorMessage(error, "Eval report request failed."));
      }
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }

  const primarySuite = useMemo(() => (report ? primaryEvalSuite(report) : null), [report]);
  const metrics = useMemo(() => (report ? buildEvalMetricRows(report) : []), [report]);
  const suites = useMemo(() => (report ? buildEvalSuiteRows(report) : []), [report]);
  const statusTone = evalStatusTone(report?.status ?? null);
  const statusLabel = report?.status ?? (loading ? "loading" : "no report");

  return (
    <div className="min-w-[720px] space-y-4">
      <section className="rounded-md border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-base font-semibold text-stone-950">Evals</h1>
              <Badge tone={statusTone}>{statusLabel}</Badge>
              {report?.mode ? <Badge tone="blue">{report.mode}</Badge> : null}
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-500">
              Read-only local eval report data from the latest generated output. This screen does not run
              evals or fabricate metrics.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled title="Running evals from the dashboard is not implemented.">
              Run all
            </Button>
            <Button disabled={loading} onClick={() => void refreshReport()} variant="primary">
              {loading ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
        </div>
        {error ? <ErrorBox message={error} title="Eval report unavailable" /> : null}
      </section>

      {loading && !report ? (
        <section className="rounded-md border border-stone-200 bg-white p-6 text-sm text-stone-500">
          Loading latest eval report...
        </section>
      ) : null}

      {report && !report.available ? (
        <section className="rounded-md border border-dashed border-stone-300 bg-white p-6">
          <Badge tone="amber">No generated report</Badge>
          <h2 className="mt-3 text-sm font-semibold text-stone-950">No local eval report found</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-500">
            Expected latest eval output at <span className="font-mono text-stone-700">{report.reportPath}</span>.
            Run the repo eval command outside this dashboard when you want this page to display results.
          </p>
        </section>
      ) : null}

      {report?.available ? (
        <>
          <section className="grid gap-3 md:grid-cols-4">
            <MetricCard label="Generated" value={evalReportGeneratedLabel(report)} />
            <MetricCard label="Suites" value={String(report.suites.length)} />
            <MetricCard label="Metrics" value={String(report.metrics.length)} />
            <MetricCard label="Report" value={report.mode ?? "local"} />
          </section>

          <section className="rounded-md border border-stone-200 bg-white">
            <div className="border-b border-stone-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-stone-950">
                    {primarySuite?.title ?? "Latest suite"}
                  </h2>
                  <p className="mt-1 text-sm text-stone-500">
                    Context Index results are shown first when present. Case rows come directly from the
                    latest report summary.
                  </p>
                </div>
                <Badge tone={evalStatusTone(primarySuite?.status ?? null)}>
                  {primarySuite?.status ?? "no suite"}
                </Badge>
              </div>
            </div>
            {primarySuite ? (
              <div className="divide-y divide-stone-100">
                {primarySuite.cases.map((testCase) => (
                  <div className="grid gap-3 p-4 sm:grid-cols-[minmax(240px,1fr)_96px_minmax(260px,2fr)]" key={testCase.id}>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-stone-950">{testCase.title}</div>
                      <div className="mt-1 truncate font-mono text-xs text-stone-500">{testCase.id}</div>
                    </div>
                    <div>
                      <Badge tone={evalStatusTone(testCase.status)}>{testCase.status}</Badge>
                    </div>
                    <div className="text-sm text-stone-600">{testCase.summary}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-sm text-stone-500">No suites were emitted in this eval report.</div>
            )}
          </section>

          <section className="rounded-md border border-stone-200 bg-white">
            <div className="border-b border-stone-200 p-4">
              <h2 className="text-base font-semibold text-stone-950">Summary Metrics</h2>
              <p className="mt-1 text-sm text-stone-500">Only aggregate metrics emitted by the report are shown.</p>
            </div>
            {metrics.length > 0 ? (
              <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
                {metrics.map((metric, index) => (
                  <MetricCard
                    key={`${metric.label}:${metric.value}:${metric.unit}:${index}`}
                    label={metric.label}
                    value={metric.value}
                    detail={metric.unit}
                  />
                ))}
              </div>
            ) : (
              <div className="p-4 text-sm text-stone-500">No aggregate metrics were emitted.</div>
            )}
          </section>

          <section className="rounded-md border border-stone-200 bg-white">
            <div className="border-b border-stone-200 p-4">
              <h2 className="text-base font-semibold text-stone-950">Suites</h2>
            </div>
            <div className="divide-y divide-stone-100">
              {suites.map((suite) => (
                <div className="grid gap-3 p-4 sm:grid-cols-[minmax(240px,1fr)_96px_96px_96px]" key={suite.id}>
                  <div className="min-w-0">
                    <div className="truncate font-medium text-stone-950">{suite.title}</div>
                    <div className="mt-1 truncate font-mono text-xs text-stone-500">{suite.id}</div>
                  </div>
                  <Badge tone={evalStatusTone(suite.status)}>{suite.status}</Badge>
                  <div className="font-mono text-sm text-stone-600">{suite.cases}</div>
                  <div className="font-mono text-sm text-stone-600">{suite.metrics}</div>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-md border border-stone-200 bg-white p-4">
      <div className="mb-2">
        <Badge>{label}</Badge>
      </div>
      <div className="break-words font-mono text-2xl font-semibold text-stone-950">{value}</div>
      {detail ? <div className="mt-1 font-mono text-xs text-stone-500">{detail}</div> : null}
    </div>
  );
}

function ErrorBox({ title, message }: { title: string; message: string }) {
  return (
    <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      <div className="font-semibold">{title}</div>
      <div className="mt-1 break-words font-mono text-xs">{message}</div>
    </div>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
