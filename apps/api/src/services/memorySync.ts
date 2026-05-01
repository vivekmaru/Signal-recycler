import { type MemoryRecord } from "@signal-recycler/shared";

type SyncPath = "AGENTS.md" | "CLAUDE.md";

const startMarker = "<!-- signal-recycler:start -->";
const endMarker = "<!-- signal-recycler:end -->";
const markerReplacements = [
  [startMarker, "signal-recycler start marker"],
  [endMarker, "signal-recycler end marker"]
] as const;

export type ParsedSyncedMemory = {
  category: string;
  rule: string;
  reason: string;
  path: SyncPath;
  section: string;
};

export function renderSyncedMemoryBlock(path: SyncPath, memories: MemoryRecord[]): string {
  const lines = [
    startMarker,
    `# Signal Recycler Memory Export (${path})`,
    "",
    "Signal Recycler remains the runtime source of truth. This block is exported for agent compatibility.",
    ""
  ];

  for (const memory of memories) {
    lines.push(`- **${formatField(memory.category)}:** ${formatField(memory.rule)}`);
    lines.push(`  - Reason: ${formatField(memory.reason)}`);
    lines.push(`  - Source: ${formatField(memory.source.kind)}`);
  }

  lines.push(endMarker);
  return lines.join("\n");
}

export function parseSyncedMemoryBlock(path: SyncPath, content: string): ParsedSyncedMemory[] {
  const start = content.indexOf(startMarker);
  const end = start === -1 ? -1 : content.indexOf(endMarker, start + startMarker.length);
  if (start === -1 || end === -1 || end <= start) return [];

  const block = content.slice(start, end);
  const lines = block.split(/\r?\n/);
  const parsed: ParsedSyncedMemory[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index]?.match(/^- \*\*(.+?):\*\* (.+)$/);
    if (!match) continue;

    const reasonLine = lines[index + 1] ?? "";
    const reasonMatch = reasonLine.match(/^  - Reason: (.+)$/);
    parsed.push({
      category: match[1] ?? "",
      rule: match[2] ?? "",
      reason: reasonMatch?.[1] ?? "Imported from Signal Recycler compatibility block.",
      path,
      section: "signal-recycler"
    });
  }

  return parsed;
}

function formatField(value: string): string {
  let normalized = value;
  for (const [marker, replacement] of markerReplacements) {
    normalized = normalized.replaceAll(marker, replacement);
  }

  return normalized
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\\*[\]`]/g, "\\$&");
}
