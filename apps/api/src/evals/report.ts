import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  type EvalCaseResult,
  type EvalMetric,
  type EvalReport,
  type EvalStatus,
  type EvalSuiteResult
} from "./types.js";

const STATUS_RANK: Record<EvalStatus, number> = {
  fail: 4,
  warn: 3,
  skip: 2,
  pass: 1
};

export function aggregateStatus(statuses: EvalStatus[]): EvalStatus {
  return statuses.reduce<EvalStatus>(
    (current, next) => (STATUS_RANK[next] > STATUS_RANK[current] ? next : current),
    "pass"
  );
}

export function buildReport(input: {
  generatedAt?: string;
  mode: "local" | "live";
  suites: EvalSuiteResult[];
}): EvalReport {
  const metrics = input.suites.flatMap((suite) => suite.metrics ?? []);
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    mode: input.mode,
    status: aggregateStatus(input.suites.map((suite) => suite.status)),
    suites: input.suites,
    metrics
  };
}

export function renderMarkdownReport(report: EvalReport): string {
  const lines: string[] = [];
  lines.push("# Signal Recycler Eval Report");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Mode: ${report.mode}`);
  lines.push(`Status: ${report.status}`);
  lines.push("");
  lines.push("## Summary Metrics");
  if (report.metrics.length === 0) {
    lines.push("");
    lines.push("No aggregate metrics emitted.");
  } else {
    lines.push("");
    lines.push("| Metric | Value | Unit |");
    lines.push("| --- | ---: | --- |");
    for (const item of report.metrics) {
      lines.push(`| ${item.name} | ${item.value} | ${item.unit ?? ""} |`);
    }
  }
  lines.push("");
  lines.push("## Suites");
  for (const suite of report.suites) {
    lines.push("");
    lines.push(`### ${suite.title}`);
    lines.push("");
    lines.push(`Status: ${suite.status}`);
    lines.push("");
    lines.push("| Case | Status | Summary |");
    lines.push("| --- | --- | --- |");
    for (const testCase of suite.cases) {
      lines.push(`| ${testCase.title} | ${testCase.status} | ${escapeTable(testCase.summary)} |`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export async function writeReportFiles(report: EvalReport, outputDir = ".signal-recycler/evals") {
  await mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, "latest.json");
  const markdownPath = path.join(outputDir, "latest.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, renderMarkdownReport(report), "utf8");
  return { jsonPath, markdownPath };
}

export function metric(name: string, value: number, unit?: string): EvalMetric {
  return unit ? { name, value, unit } : { name, value };
}

export function suiteResult(input: {
  id: string;
  title: string;
  cases: EvalCaseResult[];
  metrics?: EvalMetric[];
}): EvalSuiteResult {
  return {
    id: input.id,
    title: input.title,
    cases: input.cases,
    metrics: input.metrics,
    status: aggregateStatus(input.cases.map((testCase) => testCase.status))
  };
}

function escapeTable(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}
