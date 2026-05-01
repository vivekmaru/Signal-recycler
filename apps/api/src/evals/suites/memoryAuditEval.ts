import { recordMemoryInjection } from "../../services/memoryInjection.js";
import { createStore } from "../../store.js";
import { metric, suiteResult } from "../report.js";
import { type EvalSuiteResult } from "../types.js";

export async function runMemoryAuditEval(): Promise<EvalSuiteResult> {
  const store = createStore(":memory:");
  const session = store.createSession({ projectId: "demo", title: "Memory audit eval" });
  const manual = store.approveRule(
    store.createRuleCandidate({
      projectId: "demo",
      category: "package-manager",
      rule: "Use pnpm for package management.",
      reason: "The workspace uses pnpm.",
      source: { kind: "manual", author: "local-user" },
      confidence: "high"
    }).id
  );
  const synced = store.approveRule(
    store.createRuleCandidate({
      projectId: "demo",
      category: "agent-instructions",
      rule: "Check approved memory before suggesting package commands.",
      reason: "Imported from AGENTS.md compatibility block.",
      source: { kind: "synced_file", path: "AGENTS.md", section: "signal-recycler" },
      memoryType: "synced_file",
      confidence: "high",
      syncStatus: "imported"
    }).id
  );

  recordMemoryInjection({
    store,
    projectId: "demo",
    sessionId: session.id,
    adapter: "eval",
    memories: [manual, synced],
    reason: "approved_project_memory"
  });

  const memories = store.listApprovedRules("demo");
  const usageCount = memories.reduce(
    (count, memory) => count + store.listMemoryUsages(memory.id).length,
    0
  );
  const provenanceComplete = memories.every(
    (memory) => memory.source.kind === "manual" || memory.source.kind === "synced_file"
  );

  return suiteResult({
    id: "memory-audit",
    title: "Memory Audit Evals",
    cases: [
      {
        id: "memory-audit.provenance",
        title: "Approved memories retain distinct provenance",
        status: provenanceComplete ? "pass" : "fail",
        summary: provenanceComplete
          ? "Manual and synced memories keep distinct source metadata."
          : "At least one memory lost source metadata."
      },
      {
        id: "memory-audit.usage",
        title: "Injected memories produce usage rows",
        status: usageCount === 2 ? "pass" : "fail",
        summary: `Recorded ${usageCount} usage rows for 2 injected memories.`
      }
    ],
    metrics: [
      metric("memory_provenance_coverage", provenanceComplete ? 1 : 0, "ratio"),
      metric("memory_usage_rows", usageCount, "rows")
    ]
  });
}
