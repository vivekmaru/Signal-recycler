#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { parseArgs } from "./args.js";
import { createApiClient } from "./apiClient.js";
import { runCommand } from "./runCommand.js";

export function usage(): string {
  return [
    "Usage:",
    "  sr run [--agent default|codex|mock] [--session id] [--api url] [--title title] [--json] [--no-watch] <prompt>",
    "",
    "Examples:",
    "  sr run --agent codex \"fix the failing tests\"",
    "  sr run --session session_abc123 \"now add regression coverage\""
  ].join("\n");
}

async function main(argv: string[]): Promise<number> {
  const command = parseArgs(argv);
  if (command.command === "help") {
    console.log(usage());
    return 0;
  }

  const client = createApiClient({ baseUrl: command.apiBaseUrl });
  await runCommand(command, {
    client,
    write: (line) => console.log(line),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  });
  return 0;
}

function isDirectRun(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint && import.meta.url === pathToFileURL(entrypoint).href);
}

if (isDirectRun()) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      console.error("");
      console.error(usage());
      process.exitCode = 1;
    }
  );
}
