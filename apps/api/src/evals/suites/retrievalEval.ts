import { injectPlaybookRules } from "../../playbook.js";
import { retrieveRelevantMemories } from "../../services/memoryRetrieval.js";
import { createStore } from "../../store.js";
import { metric, suiteResult } from "../report.js";
import { type EvalCaseResult, type EvalSuiteResult } from "../types.js";

export function runRetrievalEval(): EvalSuiteResult {
  const store = createStore(":memory:");
  const projectId = "eval-retrieval-demo";
  const otherProjectId = "eval-retrieval-other";
  const relevant = store.approveRule(
    store.createRuleCandidate({
      projectId,
      category: "package-manager",
      rule: "Use pnpm test instead of npm test.",
      reason: "The repo uses pnpm workspaces."
    }).id
  );
  const unrelated = store.approveRule(
    store.createRuleCandidate({
      projectId,
      category: "theme",
      rule: "Use approved color tokens for UI theme changes.",
      reason: "Theme work follows design tokens."
    }).id
  );
  const current = store.approveRule(
    store.createRuleCandidate({
      projectId,
      category: "validation",
      rule: "Use pnpm test for validation.",
      reason: "Current project convention."
    }).id
  );
  const stale = store.approveRule(
    store.createRuleCandidate({
      projectId,
      category: "validation",
      rule: "Use npm test for validation.",
      reason: "Old convention."
    }).id
  );
  store.supersedeRule(stale.id, current.id);
  store.approveRule(
    store.createRuleCandidate({
      projectId: otherProjectId,
      category: "package-manager",
      rule: "Use npm test in the other project.",
      reason: "Other project convention."
    }).id
  );

  const query = "package manager pnpm test validation";
  const relevantRetrieval = retrieveRelevantMemories({
    store,
    projectId,
    query: "package manager pnpm test",
    limit: 1
  });
  const topMemoryId = relevantRetrieval.selected[0]?.memoryId ?? null;
  const recallAt1 = topMemoryId === relevant.id ? 1 : 0;
  const precisionAt1 =
    relevantRetrieval.selected.length === 1 && topMemoryId === relevant.id ? 1 : 0;

  const tokenRetrieval = retrieveRelevantMemories({ store, projectId, query, limit: 1 });
  const injectAllPrompt = injectPlaybookRules(query, store.listApprovedRules(projectId));
  const retrievedPrompt = injectPlaybookRules(query, tokenRetrieval.memories);
  const tokensAddedDelta =
    estimateTokensAdded(retrievedPrompt, query) - estimateTokensAdded(injectAllPrompt, query);
  const selectedMemoryIds = tokenRetrieval.selected.map((decision) => decision.memoryId);
  const skippedMemoryIds = tokenRetrieval.skipped.map((decision) => decision.memoryId);
  const relevantMemorySelected = selectedMemoryIds.includes(relevant.id);
  const unrelatedMemorySkipped = skippedMemoryIds.includes(unrelated.id);

  const supersededRetrieval = retrieveRelevantMemories({
    store,
    projectId,
    query: "validation npm test command",
    limit: 5
  });
  const staleMemoryFailures = supersededRetrieval.selected.some(
    (decision) => decision.memoryId === stale.id
  )
    ? 1
    : 0;

  const projectRetrieval = retrieveRelevantMemories({
    store,
    projectId,
    query: "other project npm test",
    limit: 5
  });
  const crossProjectSelections = projectRetrieval.selected.filter((decision) =>
    store.getRule(decision.memoryId)?.projectId !== projectId
  ).length;

  const emptyQueryRetrieval = retrieveRelevantMemories({
    store,
    projectId,
    query: "a",
    limit: 5
  });

  const cases: EvalCaseResult[] = [
    {
      id: "retrieval.relevant-memory",
      title: "Relevant memory ranks first",
      status: recallAt1 === 1 && precisionAt1 === 1 ? "pass" : "fail",
      summary: `topMemoryId=${topMemoryId ?? "none"}`,
      metrics: [
        metric("retrieval_recall_at_1", recallAt1, "ratio"),
        metric("retrieval_precision_at_1", precisionAt1, "ratio")
      ],
      details: {
        expectedMemoryId: relevant.id,
        selected: relevantRetrieval.selected,
        skipped: relevantRetrieval.skipped
      }
    },
    {
      id: "retrieval.token-reduction",
      title: "Retrieval adds fewer tokens than inject-all",
      status:
        tokensAddedDelta < 0 && relevantMemorySelected && unrelatedMemorySkipped ? "pass" : "fail",
      summary: `tokens_added_delta_vs_inject_all=${tokensAddedDelta}`,
      metrics: [metric("tokens_added_delta_vs_inject_all", tokensAddedDelta, "tokens")],
      details: {
        injectAllMemories: store.listApprovedRules(projectId).length,
        retrievedMemories: tokenRetrieval.memories.length,
        relevantMemoryId: relevant.id,
        unrelatedMemoryId: unrelated.id,
        selectedMemoryIds,
        skippedMemoryIds,
        relevantMemorySelected,
        unrelatedMemorySkipped
      }
    },
    {
      id: "retrieval.superseded-memory",
      title: "Superseded memory is not selected",
      status: staleMemoryFailures === 0 ? "pass" : "fail",
      summary: `stale_memory_failures=${staleMemoryFailures}`,
      metrics: [metric("stale_memory_failures", staleMemoryFailures, "failures")],
      details: {
        staleMemoryId: stale.id,
        replacementMemoryId: current.id,
        selected: supersededRetrieval.selected
      }
    },
    {
      id: "retrieval.project-isolation",
      title: "Retrieval remains project isolated",
      status: crossProjectSelections === 0 ? "pass" : "fail",
      summary: `crossProjectSelections=${crossProjectSelections}`,
      metrics: [metric("retrieval_cross_project_selections", crossProjectSelections, "memories")],
      details: {
        selected: projectRetrieval.selected
      }
    },
    {
      id: "retrieval.no-query-no-inject-all",
      title: "Empty searchable query does not fall back to inject-all",
      status: emptyQueryRetrieval.selected.length === 0 ? "pass" : "fail",
      summary: `selectedMemories=${emptyQueryRetrieval.selected.length}`,
      metrics: [
        metric("retrieval_empty_query_selected", emptyQueryRetrieval.selected.length, "memories")
      ],
      details: {
        selected: emptyQueryRetrieval.selected,
        skipped: emptyQueryRetrieval.skipped
      }
    }
  ];

  return suiteResult({
    id: "retrieval",
    title: "Memory Retrieval",
    cases,
    metrics: [
      metric("retrieval_recall_at_1", recallAt1, "ratio"),
      metric("retrieval_precision_at_1", precisionAt1, "ratio"),
      metric("tokens_added_delta_vs_inject_all", tokensAddedDelta, "tokens"),
      metric("stale_memory_failures", staleMemoryFailures, "failures")
    ]
  });
}

function estimateTokensAdded(promptWithMemory: string, originalPrompt: string): number {
  return Math.round((promptWithMemory.length - originalPrompt.length) / 4);
}
