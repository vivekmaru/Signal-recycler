#!/usr/bin/env node
import { parseArgs } from "./args.js";

try {
  const command = parseArgs(process.argv.slice(2));
  if (command.command === "help") {
    console.log("Usage: sr run [--agent codex|mock|default] [--session id] [--api url] <prompt>");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
