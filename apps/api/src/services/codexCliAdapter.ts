import {
  Codex,
  type ThreadEvent,
  type ThreadItem,
  type ThreadOptions,
  type Usage
} from "@openai/codex-sdk";
import { type TimelineEvent } from "@signal-recycler/shared";
import { type SignalRecyclerStore } from "../store.js";
import { type AgentAdapter } from "../types.js";

const MAX_EVENT_BODY_LENGTH = 8000;
const MAX_RAW_METADATA_LENGTH = 8000;
const MAX_RETAINED_ITEMS = 200;
const TRUNCATION_SUFFIX = "\n[truncated]";

type ThreadLike = {
  runStreamed(input: string): Promise<{ events: AsyncGenerator<ThreadEvent> }>;
};

type CodexLike = {
  startThread(options?: ThreadOptions): ThreadLike;
  resumeThread(id: string, options?: ThreadOptions): ThreadLike;
};

export function createCodexCliAdapter(input: {
  store: SignalRecyclerStore;
  command?: string;
  codex?: CodexLike;
}): AgentAdapter {
  const codex =
    input.codex ??
    new Codex({
      ...(input.command ? { codexPathOverride: input.command } : {}),
      env: stringEnv(process.env)
    });

  return {
    id: "codex_cli",
    async run(runInput) {
      let codexThreadId = latestCodexThreadId(input.store.listEvents(runInput.sessionId));
      const threadOptions: ThreadOptions = {
        ...(runInput.workingDirectory ? { workingDirectory: runInput.workingDirectory } : {}),
        skipGitRepoCheck: true
      };
      const thread = codexThreadId
        ? codex.resumeThread(codexThreadId, threadOptions)
        : codex.startThread(threadOptions);
      const { events } = await thread.runStreamed(runInput.prompt);
      const items: ThreadItem[] = [];
      let finalResponse = "";
      let failure: string | null = null;

      for await (const event of events) {
        if (event.type === "thread.started") {
          codexThreadId = event.thread_id;
        }

        if (event.type === "item.completed") {
          if (items.length < MAX_RETAINED_ITEMS) {
            items.push(event.item);
          }
          if (event.item.type === "agent_message") {
            finalResponse = event.item.text;
          }
        }

        input.store.createEvent({
          sessionId: runInput.sessionId,
          category: "codex_event",
          title: titleForEvent(event),
          body: truncateText(bodyForEvent(event), MAX_EVENT_BODY_LENGTH),
          metadata: metadataForEvent(event, codexThreadId)
        });

        const eventFailure = failureMessageForEvent(event);
        if (eventFailure) {
          failure = eventFailure;
          break;
        }
      }

      if (failure) throw new Error(failure);

      return {
        finalResponse,
        items
      };
    }
  };
}

function latestCodexThreadId(events: TimelineEvent[]): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const value = events[index]?.metadata["codexThreadId"];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function failureMessageForEvent(event: ThreadEvent): string | null {
  switch (event.type) {
    case "turn.failed":
      return event.error.message;
    case "error":
      return event.message;
    default:
      return null;
  }
}

function titleForEvent(event: ThreadEvent): string {
  switch (event.type) {
    case "thread.started":
      return "Codex thread started";
    case "turn.started":
      return "Codex turn started";
    case "turn.completed":
      return "Codex turn completed";
    case "turn.failed":
      return "Codex turn failed";
    case "item.started":
      return titleForItem(event.item, "started");
    case "item.updated":
      return titleForItem(event.item, "updated");
    case "item.completed":
      return titleForItem(event.item, "completed");
    case "error":
      return "Codex SDK error";
  }
}

function titleForItem(item: ThreadItem, phase: "started" | "updated" | "completed"): string {
  switch (item.type) {
    case "agent_message":
      return phase === "completed" ? "Codex CLI message" : `Codex message ${phase}`;
    case "command_execution":
      return `Codex command ${phase}`;
    case "file_change":
      return `Codex file change ${phase}`;
    case "mcp_tool_call":
      return `Codex MCP tool ${phase}`;
    case "reasoning":
      return `Codex reasoning ${phase}`;
    case "web_search":
      return `Codex web search ${phase}`;
    case "todo_list":
      return `Codex todo list ${phase}`;
    case "error":
      return "Codex item error";
  }
}

function bodyForEvent(event: ThreadEvent): string {
  switch (event.type) {
    case "thread.started":
      return `Codex thread ${event.thread_id} started.`;
    case "turn.started":
      return "Codex turn started.";
    case "turn.completed":
      return usageSummary(event.usage);
    case "turn.failed":
      return event.error.message;
    case "item.started":
    case "item.updated":
    case "item.completed":
      return bodyForItem(event.item);
    case "error":
      return event.message;
  }
}

function bodyForItem(item: ThreadItem): string {
  switch (item.type) {
    case "agent_message":
      return item.text;
    case "command_execution":
      return [`$ ${item.command}`, item.aggregated_output].filter(Boolean).join("\n");
    case "file_change":
      return item.changes.map((change) => `${change.kind} ${change.path}`).join("\n");
    case "mcp_tool_call":
      return `${item.server}.${item.tool}`;
    case "reasoning":
      return item.text;
    case "web_search":
      return item.query;
    case "todo_list": {
      const completed = item.items.filter((todo) => todo.completed).length;
      return `${completed}/${item.items.length} todo items completed.`;
    }
    case "error":
      return item.message;
  }
}

function metadataForEvent(event: ThreadEvent, codexThreadId: string | null): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    adapter: "codex_cli",
    sdkEventType: event.type,
    raw: toBoundedRaw(event)
  };
  if (codexThreadId) metadata.codexThreadId = codexThreadId;
  if ("item" in event) metadata.itemType = event.item.type;
  if (event.type === "turn.completed") metadata.usage = event.usage;
  return metadata;
}

function usageSummary(usage: Usage): string {
  return [
    `Input tokens: ${usage.input_tokens}`,
    `Cached input tokens: ${usage.cached_input_tokens}`,
    `Output tokens: ${usage.output_tokens}`,
    `Reasoning output tokens: ${usage.reasoning_output_tokens}`
  ].join("\n");
}

function toBoundedRaw(raw: unknown): unknown {
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

function stringEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}
