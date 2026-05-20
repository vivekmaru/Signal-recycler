import { readFile } from "node:fs/promises";
import path from "node:path";
import { type FastifyInstance } from "fastify";
import {
  evalReportSchema,
  type EvalReport,
  type EvalReportSummary,
  type EvalSuiteSummary
} from "@signal-recycler/shared";

export type EvalRouteOptions = {
  evalReportDir: string;
};

export async function registerEvalRoutes(
  app: FastifyInstance,
  options: EvalRouteOptions
): Promise<void> {
  app.get("/api/evals/report", async (_request, reply) => {
    const reportPath = path.join(options.evalReportDir, "latest.json");
    const markdownPath = path.join(options.evalReportDir, "latest.md");
    let rawReport: string;

    try {
      rawReport = await readFile(reportPath, "utf8");
    } catch (error) {
      if (isNotFound(error)) return emptyReportSummary(reportPath, markdownPath);
      throw error;
    }

    const parsedJson = parseReportJson(rawReport);
    if (!parsedJson.ok) {
      return reply.code(422).send({
        error: "Invalid eval report",
        message: parsedJson.message,
        reportPath
      });
    }

    const parsed = evalReportSchema.safeParse(parsedJson.value);
    if (!parsed.success) {
      return reply.code(422).send({
        error: "Invalid eval report",
        message: parsed.error.issues.map((issue) => issue.message).join("; "),
        reportPath
      });
    }

    return buildReportSummary(parsed.data, reportPath, markdownPath);
  });
}

function parseReportJson(rawReport: string): { ok: true; value: unknown } | { ok: false; message: string } {
  try {
    return { ok: true, value: JSON.parse(rawReport) as unknown };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Report JSON could not be parsed." };
  }
}

function emptyReportSummary(reportPath: string, markdownPath: string): EvalReportSummary {
  return {
    available: false,
    generatedAt: null,
    mode: null,
    status: null,
    reportPath,
    markdownPath,
    metrics: [],
    suites: []
  };
}

function buildReportSummary(
  report: EvalReport,
  reportPath: string,
  markdownPath: string
): EvalReportSummary {
  return {
    available: true,
    generatedAt: report.generatedAt,
    mode: report.mode,
    status: report.status,
    reportPath,
    markdownPath,
    metrics: report.metrics,
    suites: report.suites.map(summarizeSuite)
  };
}

function summarizeSuite(suite: EvalReport["suites"][number]): EvalSuiteSummary {
  return {
    id: suite.id,
    title: suite.title,
    status: suite.status,
    metrics: suite.metrics ?? [],
    cases: suite.cases.map(({ details: _details, ...testCase }) => testCase)
  };
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
