import type { TimelineEvent } from "@signal-recycler/shared";

export type SdkSessionLifecycle = "none" | "new_thread" | "resumed_thread";

export type SdkSessionSummary = {
  codexThreadId: string | null;
  eventCount: number;
  itemCount: number;
  lifecycle: SdkSessionLifecycle;
  totalInputTokens: number;
  totalOutputTokens: number;
};

export type SdkEventFact = {
  label: string;
  value: string;
};

type UsageMetadata = {
  input_tokens?: unknown;
  cached_input_tokens?: unknown;
  output_tokens?: unknown;
  reasoning_output_tokens?: unknown;
};

export function summarizeSdkSession(events: TimelineEvent[]): SdkSessionSummary {
  const sdkEvents = events.filter((event) => typeof event.metadata["sdkEventType"] === "string");
  const codexThreadId = latestStringMetadata(sdkEvents, "codexThreadId");
  const hasThreadStarted = sdkEvents.some((event) => event.metadata["sdkEventType"] === "thread.started");
  const promptCount = events.filter(isPromptEvent).length;
  const lifecycle: SdkSessionLifecycle = !codexThreadId
    ? "none"
    : !hasThreadStarted || promptCount > 1
      ? "resumed_thread"
      : "new_thread";

  return sdkEvents.reduce<SdkSessionSummary>(
    (summary, event) => {
      const usage = usageMetadata(event.metadata["usage"]);
      return {
        ...summary,
        itemCount: summary.itemCount + (typeof event.metadata["itemType"] === "string" ? 1 : 0),
        totalInputTokens: summary.totalInputTokens + metadataNumber(usage?.input_tokens),
        totalOutputTokens: summary.totalOutputTokens + metadataNumber(usage?.output_tokens)
      };
    },
    {
      codexThreadId,
      eventCount: sdkEvents.length,
      itemCount: 0,
      lifecycle,
      totalInputTokens: 0,
      totalOutputTokens: 0
    }
  );
}

export function sdkEventFacts(event: TimelineEvent): SdkEventFact[] {
  const facts: SdkEventFact[] = [];
  const sdkEventType = metadataString(event.metadata["sdkEventType"]);
  const itemType = metadataString(event.metadata["itemType"]);
  const codexThreadId = metadataString(event.metadata["codexThreadId"]);
  const usage = usageMetadata(event.metadata["usage"]);

  if (sdkEventType) facts.push({ label: "SDK event", value: sdkEventType });
  if (itemType) facts.push({ label: "Item type", value: itemType });
  if (codexThreadId) facts.push({ label: "Codex thread", value: codexThreadId });
  if (usage) {
    facts.push(
      { label: "Input tokens", value: String(metadataNumber(usage.input_tokens)) },
      { label: "Cached input", value: String(metadataNumber(usage.cached_input_tokens)) },
      { label: "Output tokens", value: String(metadataNumber(usage.output_tokens)) },
      { label: "Reasoning tokens", value: String(metadataNumber(usage.reasoning_output_tokens)) }
    );
  }

  return facts;
}

export function sdkEventBadges(event: TimelineEvent): string[] {
  return [metadataString(event.metadata["sdkEventType"]), metadataString(event.metadata["itemType"])].filter(
    (value): value is string => Boolean(value)
  );
}

function latestStringMetadata(events: TimelineEvent[], key: string): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const value = metadataString(events[index]?.metadata[key]);
    if (value) return value;
  }
  return null;
}

function usageMetadata(value: unknown): UsageMetadata | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UsageMetadata) : null;
}

function metadataString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function metadataNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isPromptEvent(event: TimelineEvent): boolean {
  return event.category === "codex_event" && (event.metadata["phase"] === "input" || /user prompt/i.test(event.title));
}
