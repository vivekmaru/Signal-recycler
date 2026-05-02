import { spawn } from "node:child_process";
import { type SignalRecyclerStore } from "../store.js";
import { type AgentAdapter } from "../types.js";

type ParsedCodexEvent = {
  kind: "message" | "raw";
  body: string;
  raw: unknown;
};

export function parseCodexJsonLine(line: string): ParsedCodexEvent {
  try {
    const raw = JSON.parse(line) as unknown;
    if (
      isRecord(raw) &&
      raw.type === "message" &&
      raw.role === "assistant" &&
      typeof raw.content === "string"
    ) {
      return { kind: "message", body: raw.content, raw };
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
        const child = spawn(command, ["exec", "--json", runInput.prompt], {
          cwd: runInput.workingDirectory,
          env: process.env
        });
        const assistantMessages: string[] = [];
        const items: unknown[] = [];
        const stderrChunks: string[] = [];
        let stdoutBuffer = "";
        let settled = false;

        const emitLine = (line: string) => {
          if (line.length === 0) return;

          const event = parseCodexJsonLine(line);
          items.push(event.raw);
          if (event.kind === "message") {
            assistantMessages.push(event.body);
          }
          input.store.createEvent({
            sessionId: runInput.sessionId,
            category: "codex_event",
            title: event.kind === "message" ? "Codex CLI message" : "Codex CLI event",
            body: event.body,
            metadata: { adapter: "codex_cli", raw: event.raw }
          });
        };

        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => {
          stdoutBuffer += chunk;
          const lines = stdoutBuffer.split(/\r?\n/);
          stdoutBuffer = lines.pop() ?? "";
          for (const line of lines) emitLine(line);
        });

        child.stderr.setEncoding("utf8");
        child.stderr.on("data", (chunk: string) => {
          stderrChunks.push(chunk);
        });

        child.on("error", (error) => {
          if (settled) return;
          settled = true;
          reject(error);
        });

        child.on("close", (code) => {
          if (settled) return;
          settled = true;
          emitLine(stdoutBuffer);
          if (code !== 0) {
            reject(
              new Error(
                `codex exec failed with exit code ${code}: ${stderrChunks.join("").trim()}`
              )
            );
            return;
          }

          resolve({
            finalResponse: assistantMessages.join("\n"),
            items
          });
        });
      });
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
