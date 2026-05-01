import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { injectPlaybookRules } from "../../playbook.js";
import { metric, suiteResult } from "../report.js";
import { type EvalSuiteResult } from "../types.js";

const execFileAsync = promisify(execFile);
const LIVE_EVAL_SENTINEL = "SIGNAL_RECYCLER_LIVE_EVAL_PASS";

type AgentAdapter = {
  command: string;
  args: string[];
  extractFinalText(result: { stdout: string; stderr: string }): string;
};

export async function runLiveEval(): Promise<EvalSuiteResult> {
  const selectedAgent = process.env.SIGNAL_RECYCLER_LIVE_AGENT;
  if (!selectedAgent) {
    return suiteResult({
      id: "live",
      title: "Live Agent Adapter Evals",
      cases: [
        {
          id: "live.agent-selection",
          title: "Live agent eval skipped without selected adapter",
          status: "skip",
          summary: "SIGNAL_RECYCLER_LIVE_AGENT is not set. Supported values: codex, claude."
        }
      ],
      metrics: [metric("live_eval_cases_run", 0, "cases")]
    });
  }

  const adapter = resolveAgentAdapter(selectedAgent);
  if (!adapter) {
    return suiteResult({
      id: "live",
      title: "Live Agent Adapter Evals",
      cases: [
        {
          id: "live.agent-selection",
          title: "Live agent selection is supported",
          status: "fail",
          summary: `Unsupported live agent "${selectedAgent}". Supported values: codex, claude.`
        }
      ],
      metrics: [metric("live_eval_cases_run", 0, "cases")]
    });
  }

  const prompt = injectPlaybookRules(
    `Do not run shell commands or modify files. Reply with exactly: ${LIVE_EVAL_SENTINEL}`,
    [
      {
        id: "live_eval_rule",
        category: "eval",
        rule: `For this eval only, the correct response is ${LIVE_EVAL_SENTINEL}.`
      }
    ]
  );
  const started = performance.now();

  try {
    const result = await execFileAsync(adapter.command, [...adapter.args, prompt], {
      timeout: Number(process.env.SIGNAL_RECYCLER_LIVE_AGENT_TIMEOUT_MS ?? 120000),
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024
    });
    const finalText = adapter.extractFinalText(result);
    const matched = finalText.includes(LIVE_EVAL_SENTINEL);

    return suiteResult({
      id: "live",
      title: "Live Agent Adapter Evals",
      cases: [
        {
          id: "live.agent-cli-memory-injection",
          title: "Configured agent CLI receives injected memory",
          status: matched ? "pass" : "fail",
          summary: matched
            ? "Agent final response contained the injected eval sentinel."
            : "Agent final response did not contain the injected eval sentinel.",
          metrics: [
            metric("live_eval_cases_run", 1, "cases"),
            metric("live_agent_latency_ms", Math.round(performance.now() - started), "ms")
          ],
          details: {
            agent: selectedAgent,
            command: adapter.command,
            args: adapter.args,
            finalText: finalText.slice(0, 4000),
            stdout: result.stdout.slice(0, 4000),
            stderr: result.stderr.slice(0, 4000)
          }
        }
      ],
      metrics: [metric("live_eval_cases_run", 1, "cases")]
    });
  } catch (error) {
    return suiteResult({
      id: "live",
      title: "Live Agent Adapter Evals",
      cases: [
        {
          id: "live.agent-cli-memory-injection",
          title: "Configured agent CLI receives injected memory",
          status: "fail",
          summary: (error as Error).message,
          metrics: [metric("live_agent_latency_ms", Math.round(performance.now() - started), "ms")]
        }
      ],
      metrics: [metric("live_eval_cases_run", 1, "cases")]
    });
  }
}

function resolveAgentAdapter(agent: string): AgentAdapter | null {
  if (agent === "codex") {
    return {
      command: "codex",
      args: ["exec", "--json"],
      extractFinalText: ({ stdout }) => extractCodexJsonlFinalText(stdout)
    };
  }
  if (agent === "claude") {
    return {
      command: "claude",
      args: ["-p"],
      extractFinalText: ({ stdout }) => stdout
    };
  }
  return null;
}

function extractCodexJsonlFinalText(stdout: string): string {
  const texts: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      const type = String(event.type ?? event.event ?? event.kind ?? "");
      if (/user|prompt|input/i.test(type)) continue;
      if (/assistant|message|final|response|completed/i.test(type)) {
        const text = extractLikelyText(event);
        if (text) texts.push(text);
      }
    } catch {
      // Ignore non-JSON output for Codex JSONL mode so prompt echoes do not create false passes.
    }
  }
  return texts.join("\n");
}

function extractLikelyText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(extractLikelyText).filter(Boolean).join("\n");
  if (!value || typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  const direct = ["text", "content", "message", "finalResponse", "output_text"]
    .map((key) => extractLikelyText(record[key]))
    .filter(Boolean);
  return direct.join("\n");
}
