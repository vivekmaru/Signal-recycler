import { type Agent, type Command } from "./types.js";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:3001";

const AGENT_ALIASES: Record<string, Agent> = {
  default: "default",
  mock: "mock",
  codex: "codex_cli",
  codex_cli: "codex_cli"
};

export function parseArgs(argv: string[]): Command {
  const [commandName, ...rest] = argv;
  if (!commandName || commandName === "help" || commandName === "--help" || commandName === "-h") {
    return { command: "help" };
  }
  if (commandName !== "run") {
    throw new Error(`Unsupported command: ${commandName}`);
  }

  let agent: Agent = "default";
  let apiBaseUrl = DEFAULT_API_BASE_URL;
  let sessionId: string | undefined;
  let title: string | undefined;
  let watch = true;
  let json = false;
  const promptParts: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token) continue;

    if (token === "--agent") {
      const value = rest[index + 1];
      if (!value) throw new Error("--agent requires a value");
      agent = parseAgent(value);
      index += 1;
      continue;
    }

    if (token === "--api") {
      const value = rest[index + 1];
      if (!value) throw new Error("--api requires a value");
      apiBaseUrl = parseApiBaseUrl(value);
      index += 1;
      continue;
    }

    if (token === "--session") {
      const value = rest[index + 1];
      if (!value) throw new Error("--session requires a value");
      sessionId = value;
      index += 1;
      continue;
    }

    if (token === "--title") {
      const value = rest[index + 1];
      if (!value) throw new Error("--title requires a value");
      title = value;
      index += 1;
      continue;
    }

    if (token === "--json") {
      json = true;
      continue;
    }

    if (token === "--no-watch") {
      watch = false;
      continue;
    }

    if (token.startsWith("--")) {
      throw new Error(`Unsupported option: ${token}`);
    }

    promptParts.push(token);
  }

  const prompt = promptParts.join(" ").trim();
  if (!prompt) throw new Error("Prompt is required");
  if (sessionId && title) throw new Error("--title can only be used when creating a new session");

  return {
    command: "run",
    prompt,
    agent,
    apiBaseUrl,
    ...(sessionId ? { sessionId } : {}),
    ...(title ? { title } : {}),
    watch,
    json
  };
}

function parseAgent(value: string): Agent {
  const agent = AGENT_ALIASES[value];
  if (!agent) throw new Error(`Unsupported agent: ${value}`);
  return agent;
}

function parseApiBaseUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("invalid protocol");
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error(`Invalid --api URL: ${value}`);
  }
}
