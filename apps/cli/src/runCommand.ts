import { type ApiClient } from "./apiClient.js";
import { formatEventLine, formatJsonSummary, formatSummary } from "./output.js";
import { type Command, type RunSummary, type TimelineEvent } from "./types.js";

type RunCommandDependencies = {
  client: ApiClient;
  write: (line: string) => void;
  sleep: (ms: number) => Promise<void>;
  dashboardUrl?: string;
};

export async function runCommand(
  command: Extract<Command, { command: "run" }>,
  deps: RunCommandDependencies
): Promise<RunSummary> {
  const config = await deps.client.getConfig();
  if (!config.availableAdapters.includes(command.agent)) {
    throw new Error(
      `Adapter ${command.agent} is not available. Available adapters: ${config.availableAdapters.join(", ")}. ` +
        "Enable Codex CLI with SIGNAL_RECYCLER_CODEX_CLI=1."
    );
  }

  const sessionId = command.sessionId ?? (await deps.client.createSession(command.title ?? command.prompt.slice(0, 80))).id;
  const continued = Boolean(command.sessionId);
  const shouldWriteHumanOutput = !command.json;
  const shouldStreamEvents = command.watch && shouldWriteHumanOutput;

  if (shouldWriteHumanOutput) {
    deps.write(continued ? `Continuing Signal Recycler session ${sessionId}` : `Signal Recycler session ${sessionId}`);
    deps.write(`Agent: ${command.agent}`);
  }

  const seenEventIds = new Set<string>();
  if (continued) {
    await markExistingEvents(sessionId, deps.client.listEvents, seenEventIds);
  }

  const runPromise = deps.client.runSession(sessionId, command.prompt, command.agent);

  if (shouldStreamEvents) {
    await pollEventsUntilComplete({
      sessionId,
      seenEventIds,
      listEvents: deps.client.listEvents,
      write: deps.write,
      sleep: deps.sleep,
      runPromise
    });
  }

  const result = await runPromise;
  const events = await deps.client.listEvents(sessionId);
  if (shouldStreamEvents) {
    for (const event of events) {
      if (!seenEventIds.has(event.id)) {
        seenEventIds.add(event.id);
        deps.write(formatEventLine(event));
      }
    }
  }

  const summary: RunSummary = {
    sessionId,
    agent: command.agent,
    finalResponse: result.finalResponse,
    dashboardUrl: deps.dashboardUrl ?? "http://127.0.0.1:5173",
    events: events.length,
    continued
  };

  deps.write(command.json ? formatJsonSummary(summary) : formatSummary(summary));
  return summary;
}

async function markExistingEvents(
  sessionId: string,
  listEvents: ApiClient["listEvents"],
  seenEventIds: Set<string>
): Promise<void> {
  const events = await listEvents(sessionId);
  for (const event of events) {
    seenEventIds.add(event.id);
  }
}

async function pollEventsUntilComplete(input: {
  sessionId: string;
  seenEventIds: Set<string>;
  listEvents: ApiClient["listEvents"];
  write: (line: string) => void;
  sleep: (ms: number) => Promise<void>;
  runPromise: Promise<unknown>;
}): Promise<void> {
  let completed = false;
  void input.runPromise.then(
    () => {
      completed = true;
    },
    () => {
      completed = true;
    }
  );

  while (!completed) {
    await printNewEvents(input.sessionId, input.listEvents, input.seenEventIds, input.write);
    await input.sleep(1000);
  }
}

async function printNewEvents(
  sessionId: string,
  listEvents: ApiClient["listEvents"],
  seenEventIds: Set<string>,
  write: (line: string) => void
): Promise<void> {
  const events: TimelineEvent[] = await listEvents(sessionId);
  for (const event of events) {
    if (seenEventIds.has(event.id)) continue;
    seenEventIds.add(event.id);
    write(formatEventLine(event));
  }
}
