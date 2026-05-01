import { type MemoryRecord } from "@signal-recycler/shared";

type SyncPath = "AGENTS.md" | "CLAUDE.md";

export type ParsedSyncedMemory = {
  category: string;
  rule: string;
  reason: string;
  path: SyncPath;
  section: string;
};

export function renderSyncedMemoryBlock(path: SyncPath, memories: MemoryRecord[]): string {
  const lines = [
    "<!-- signal-recycler:start -->",
    `# Signal Recycler Memory Export (${path})`,
    "",
    "Signal Recycler remains the runtime source of truth. This block is exported for agent compatibility.",
    ""
  ];

  for (const memory of memories) {
    lines.push(`- **${memory.category}:** ${memory.rule}`);
    lines.push(`  - Reason: ${memory.reason}`);
    lines.push(`  - Source: ${memory.source.kind}`);
  }

  lines.push("<!-- signal-recycler:end -->");
  return lines.join("\n");
}

export function parseSyncedMemoryBlock(path: SyncPath, content: string): ParsedSyncedMemory[] {
  const start = content.indexOf("<!-- signal-recycler:start -->");
  const end = content.indexOf("<!-- signal-recycler:end -->");
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
      category: match[1],
      rule: match[2],
      reason: reasonMatch?.[1] ?? "Imported from Signal Recycler compatibility block.",
      path,
      section: "signal-recycler"
    });
  }

  return parsed;
}
