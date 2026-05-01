import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildReport, writeReportFiles } from "./report.js";
import { runClassifierEval } from "./suites/classifierEval.js";
import { runCompressorEval } from "./suites/compressorEval.js";
import { runInjectionEval } from "./suites/injectionEval.js";
import { runIsolationEval } from "./suites/isolationEval.js";
import { runLiveEval } from "./suites/liveEval.js";
import { runMemoryAuditEval } from "./suites/memoryAuditEval.js";
import { runScenarioEval } from "./suites/scenarioEval.js";
import { type EvalSuiteResult } from "./types.js";

const live = process.argv.includes("--live");
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

const suites: EvalSuiteResult[] = [];
suites.push(await timed("compressor", runCompressorEval));
suites.push(await timed("classifier", runClassifierEval));
suites.push(await timed("injection", runInjectionEval));
suites.push(await timed("isolation", runIsolationEval));
suites.push(await timed("scenario", runScenarioEval));
suites.push(await timed("memory-audit", runMemoryAuditEval));
if (live) suites.push(await timed("live", runLiveEval));

const report = buildReport({
  mode: live ? "live" : "local",
  suites
});
const files = await writeReportFiles(report, path.join(repoRoot, ".signal-recycler/evals"));

console.log(`Signal Recycler eval status: ${report.status}`);
console.log(`JSON report: ${files.jsonPath}`);
console.log(`Markdown report: ${files.markdownPath}`);

if (report.status === "fail") {
  process.exitCode = 1;
}

async function timed(
  name: string,
  run: () => Promise<EvalSuiteResult> | EvalSuiteResult
): Promise<EvalSuiteResult> {
  const started = performance.now();
  const result = await run();
  const elapsedMs = Math.round(performance.now() - started);
  return {
    ...result,
    metrics: [
      ...(result.metrics ?? []),
      { name: `${name}_latency_ms`, value: elapsedMs, unit: "ms" }
    ]
  };
}
