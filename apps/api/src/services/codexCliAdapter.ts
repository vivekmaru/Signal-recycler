import { spawn } from "node:child_process";
import { type SignalRecyclerStore } from "../store.js";
import { type AgentAdapter } from "../types.js";

const MAX_EVENT_BODY_LENGTH = 8000;
const MAX_RAW_METADATA_LENGTH = 8000;
const MAX_RETAINED_ITEMS = 200;
const MAX_STDERR_LENGTH = 8000;
const TRUNCATION_SUFFIX = "\n[truncated]";

type ParsedCodexEvent = {
  kind: "message" | "raw";
  body: string;
  raw: unknown;
};

export function parseCodexJsonLine(line: string): ParsedCodexEvent {
  try {
    const raw = JSON.parse(line) as unknown;
    const assistantMessage = extractAssistantMessage(raw);
    if (assistantMessage !== null) {
      return { kind: "message", body: assistantMessage, raw };
    }

    return { kind: "raw", body: JSON.stringify(raw), raw };
  } catch {
    return { kind: "raw", body: line, raw: line };
  }
}

export function createCodexCliAdapter(input: {
  store: SignalRecyclerStore;
  command?: string;
}): AgentAdapter {
  const command = input.command ?? "codex";

  return {
    id: "codex_cli",
    run(runInput) {
      return new Promise((resolve, reject) => {
        const child = spawn(command, ["exec", "--json", "--skip-git-repo-check", runInput.prompt], {
          cwd: runInput.workingDirectory,
          env: process.env,
          stdio: ["ignore", "pipe", "pipe"]
        });
        const assistantMessages: string[] = [];
        const items: unknown[] = [];
        let stderr = "";
        let stdoutBuffer = "";
        let settled = false;

        const rejectRun = (error: Error, options: { killChild: boolean }) => {
          if (settled) return;
          settled = true;
          if (options.killChild) {
            try {
              child.kill();
            } catch {
              // Best effort: the child may already be gone or the platform may reject the signal.
            }
          }
          reject(error);
        };

        const emitLine = (line: string) => {
          if (settled) return;
          if (line.length === 0) return;

          const event = parseCodexJsonLine(line);
          if (items.length < MAX_RETAINED_ITEMS) {
            items.push(toBoundedRaw(event.raw));
          }
          if (event.kind === "message") {
            assistantMessages.push(event.body);
          }
          try {
            input.store.createEvent({
              sessionId: runInput.sessionId,
              category: "codex_event",
              title: event.kind === "message" ? "Codex CLI message" : "Codex CLI event",
              body: truncateText(event.body, MAX_EVENT_BODY_LENGTH),
              metadata: { adapter: "codex_cli", raw: toBoundedRaw(event.raw) }
            });
          } catch (error) {
            rejectRun(asError(error), { killChild: true });
          }
        };

        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => {
          if (settled) return;
          stdoutBuffer += chunk;
          const lines = stdoutBuffer.split(/\r?\n/);
          stdoutBuffer = lines.pop() ?? "";
          for (const line of lines) emitLine(line);
        });

        child.stderr.setEncoding("utf8");
        child.stderr.on("data", (chunk: string) => {
          stderr = truncateText(stderr + chunk, MAX_STDERR_LENGTH);
        });

        child.on("error", (error) => {
          rejectRun(error, { killChild: false });
        });

        child.on("close", (code) => {
          if (settled) return;
          emitLine(stdoutBuffer);
          if (settled) return;
          if (code !== 0) {
            rejectRun(
              new Error(
                `codex exec failed with exit code ${code}: ${stderr.trim()}`
              ),
              { killChild: false }
            );
            return;
          }

          settled = true;
          resolve({
            finalResponse: assistantMessages.join("\n"),
            items
          });
        });
      });
    }
  };
}

function extractAssistantMessage(value: unknown): string | null {
  if (!isRecord(value)) return null;

  if (
    value.type === "message" &&
    value.role === "assistant" &&
    typeof value.content === "string"
  ) {
    return value.content;
  }

  if (value.type !== "item.completed" || !isRecord(value.item)) return null;
  if (value.item.type !== "agent_message") return null;
  if (typeof value.item.text === "string") return value.item.text;
  if (typeof value.item.content === "string") return value.item.content;
  return null;
}

function toBoundedRaw(raw: unknown): unknown {
  if (typeof raw === "string") return truncateText(raw, MAX_RAW_METADATA_LENGTH);

  const serialized = JSON.stringify(raw);
  if (serialized.length <= MAX_RAW_METADATA_LENGTH) return raw;

  return {
    truncated: true,
    preview: truncateText(serialized, MAX_RAW_METADATA_LENGTH)
  };
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - TRUNCATION_SUFFIX.length))}${TRUNCATION_SUFFIX}`;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
