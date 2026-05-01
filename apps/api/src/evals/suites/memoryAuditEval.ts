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
  const approvedManual = memories.find((memory) => memory.id === manual.id);
  const approvedSynced = memories.find((memory) => memory.id === synced.id);
  const provenanceComplete =
    memories.length === 2 &&
    approvedManual?.source.kind === "manual" &&
    approvedManual.source.author === "local-user" &&
    approvedSynced?.source.kind === "synced_file" &&
    approvedSynced.source.path === "AGENTS.md" &&
    approvedSynced.source.section === "signal-recycler" &&
    approvedSynced.memoryType === "synced_file" &&
    approvedSynced.syncStatus === "imported";

  const memoryInjectionEvents = store
    .listEvents(session.id)
    .filter((event) => event.category === "memory_injection");
  const memoryInjectionEvent =
    memoryInjectionEvents.length === 1 ? memoryInjectionEvents[0] : undefined;
  const usageRows = [manual, synced].flatMap((memory) => store.listMemoryUsages(memory.id));
  const usageAuditComplete =
    memoryInjectionEvent !== undefined &&
    [manual, synced].every((memory) => {
      const usages = store.listMemoryUsages(memory.id);
      if (usages.length !== 1) return false;
      const usage = usages[0];
      if (!usage) return false;
      return (
        usage.sessionId === session.id &&
        usage.adapter === "eval" &&
        usage.reason === "approved_project_memory" &&
        usage.eventId === memoryInjectionEvent.id
      );
    });
  const usageCount = usageRows.length;
  const usageEventCount = new Set(usageRows.map((usage) => usage.eventId)).size;
  const usageRowsTiedToInjection = usageRows.every(
    (usage) => usage.eventId === memoryInjectionEvent?.id
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
          ? "Two approved memories keep exact manual and synced source metadata."
          : `Expected exact manual and synced provenance across 2 approved memories; found ${memories.length}.`
      },
      {
        id: "memory-audit.usage",
        title: "Injected memories produce usage rows",
        status: usageAuditComplete ? "pass" : "fail",
        summary: usageAuditComplete
          ? "Each injected memory has one usage row tied to the memory injection event."
          : `Recorded ${usageCount} usage rows across ${usageEventCount} event id(s); tiedToInjection=${usageRowsTiedToInjection}.`
      }
    ],
    metrics: [
      metric("memory_provenance_coverage", provenanceComplete ? 1 : 0, "ratio"),
      metric("approved_memory_count", memories.length, "memories"),
      metric("memory_usage_rows", usageCount, "rows"),
      metric("memory_usage_audit_coverage", usageAuditComplete ? 1 : 0, "ratio")
    ]
  });
}
