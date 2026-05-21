import type {
  EvalReportSummary,
  EvalStatus,
  EvalSuiteSummary
} from "@signal-recycler/shared";
import type { BadgeTone } from "../components/Badge";
import { formatDateTime } from "./format";

export type EvalMetricRow = {
  label: string;
  value: string;
  unit: string;
};

export type EvalSuiteRow = {
  id: string;
  title: string;
  status: EvalStatus;
  cases: string;
  metrics: string;
};

export function primaryEvalSuite(report: EvalReportSummary): EvalSuiteSummary | null {
  return report.suites.find((suite) => suite.id === "context-index") ?? report.suites[0] ?? null;
}

export function buildEvalMetricRows(report: EvalReportSummary): EvalMetricRow[] {
  return report.metrics.map((metric) => ({
    label: metric.name.replaceAll("_", " "),
    value: String(metric.value),
    unit: metric.unit ?? ""
  }));
}

export function buildEvalSuiteRows(report: EvalReportSummary): EvalSuiteRow[] {
  return [...report.suites]
    .sort((left, right) => Number(right.id === "context-index") - Number(left.id === "context-index"))
    .map((suite) => ({
      id: suite.id,
      title: suite.title,
      status: suite.status,
      cases: plural(suite.cases.length, "case"),
      metrics: plural(suite.metrics.length, "metric")
    }));
}

export function evalStatusTone(status: EvalStatus | null): BadgeTone {
  switch (status) {
    case "pass":
      return "green";
    case "fail":
      return "red";
    case "warn":
      return "amber";
    case "skip":
    case null:
      return "neutral";
  }
}

export function evalReportGeneratedLabel(report: EvalReportSummary): string {
  return report.generatedAt ? formatDateTime(report.generatedAt) : "not generated";
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
