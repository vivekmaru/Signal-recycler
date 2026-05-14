import { describe, expect, it } from "vitest";
import type { MemoryRetrievalResult } from "@signal-recycler/shared";
import { buildMemoryPreviewRows, runAdapterOptions } from "./sessionRunPresenters";

describe("runAdapterOptions", () => {
  it("filters adapters to the API-advertised runtime set", () => {
    expect(runAdapterOptions(["default", "codex_cli"]).map((option) => option.value)).toEqual([
      "default",
      "codex_cli"
    ]);
  });

  it("keeps codex_sdk labeled as a compatibility path", () => {
    expect(runAdapterOptions(["codex_sdk"])).toEqual([
      {
        value: "codex_sdk",
        label: "Codex SDK proxy"
      }
    ]);
  });
});

describe("buildMemoryPreviewRows", () => {
  it("summarizes selected and skipped memory decisions for a prompt preview", () => {
    const result = {
      query: "run validation",
      selected: [
        {
          memoryId: "mem_pnpm",
          rank: 1,
          score: 0.42,
          reason: "Matched category \"package-manager\"",
          category: "package-manager",
          memoryType: "command_convention",
          scope: { type: "project", value: null },
          source: { kind: "manual", author: "local-user" }
        }
      ],
      skipped: [{ memoryId: "mem_theme", reason: "not_relevant" }],
      metrics: {
        approvedMemories: 2,
        selectedMemories: 1,
        skippedMemories: 1,
        limit: 5
      }
    } satisfies MemoryRetrievalResult;

    expect(buildMemoryPreviewRows(result)).toEqual({
      metrics: [
        { label: "Selected", value: "1", tone: "blue" },
        { label: "Skipped", value: "1", tone: "neutral" },
        { label: "Approved", value: "2", tone: "green" },
        { label: "Limit", value: "5", tone: "neutral" }
      ],
      selectedRows: [
        {
          id: "mem_pnpm",
          title: "package-manager",
          detail: "command convention",
          reason: "Matched category \"package-manager\"",
          score: "0.42",
          rank: "1"
        }
      ],
      skippedRows: [
        {
          id: "mem_theme",
          reason: "not_relevant"
        }
      ]
    });
  });
});
