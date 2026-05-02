import path from "node:path";
import { fileURLToPath } from "node:url";
import { injectPlaybookRules } from "../../playbook.js";
import { retrieveRelevantMemories } from "../../services/memoryRetrieval.js";
import { processTurn } from "../../services/turnProcessor.js";
import { createStore } from "../../store.js";
import { metric, suiteResult } from "../report.js";
import { type EvalSuiteResult } from "../types.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const demoRepo = path.join(repoRoot, "fixtures/demo-repo");

export async function runScenarioEval(): Promise<EvalSuiteResult> {
  const projectId = "eval-demo-repo";
  const store = createStore(":memory:");
  const session = store.createSession({ projectId, title: "Package manager correction eval" });

  const firstTurn = await withoutOpenAiKey(() =>
    processTurn({
      store,
      projectId,
      sessionId: session.id,
      prompt: "Validate fixtures/demo-repo by trying npm test first.",
      codexRunner: {
        run: async () => ({
          finalResponse:
            "The fixture rejected the run. It says: Use `pnpm test` instead of `npm test`.",
          items: [{ type: "shell_call_output", output: "Use `pnpm test` instead of `npm test`." }]
        })
      }
    })
  );

  const firstRule = firstTurn.candidateRules[0];
  if (firstRule) store.approveRule(firstRule.id);
  const rules = store.listApprovedRules(projectId);
  const prompt = "Start fresh and validate fixtures/demo-repo.";
  const withoutMemory = simulatePackageManagerAgent(prompt);
  const withMemoryPrompt = injectPlaybookRules(prompt, rules);
  const withMemory = simulatePackageManagerAgent(withMemoryPrompt);
  const taskSuccessDelta = Number(withMemory.passed) - Number(withoutMemory.passed);
  const candidateRulePrecision = firstRule?.rule.includes("pnpm") ? 1 : 0;
  const tokensAddedByMemory = Math.round((String(withMemoryPrompt).length - prompt.length) / 4);
  const currentRule = store.approveRule(
    store.createRuleCandidate({
      projectId,
      category: "validation",
      rule: "Use pnpm test for validation.",
      reason: "Current project convention."
    }).id
  );
  const staleRule = store.approveRule(
    store.createRuleCandidate({
      projectId,
      category: "validation",
      rule: "Use npm test for validation.",
      reason: "Old convention."
    }).id
  );
  store.supersedeRule(staleRule.id, currentRule.id);
  const staleMemoryRetrieval = retrieveRelevantMemories({
    store,
    projectId,
    query: "validate tests with package manager",
    limit: 5
  });
  const staleMemoryFailures = staleMemoryRetrieval.selected.some(
    (decision) => decision.memoryId === staleRule.id
  )
    ? 1
    : 0;
  const retrievedMemoryPrompt = injectPlaybookRules(prompt, staleMemoryRetrieval.memories);
  const staleMemoryPrompt = injectPlaybookRules(prompt, [staleRule]);
  const legacyInjectAllPrompt = injectPlaybookRules(prompt, [staleRule, currentRule]);
  const withRetrievedMemory = simulatePackageManagerAgent(retrievedMemoryPrompt);
  const withStaleMemory = simulatePackageManagerAgent(staleMemoryPrompt);
  const withInjectAllMemory = simulatePackageManagerAgent(legacyInjectAllPrompt);
  const staleMemoryOutcomeProtected =
    staleMemoryFailures === 0 &&
    withRetrievedMemory.passed &&
    !withStaleMemory.passed &&
    !withInjectAllMemory.passed;

  return suiteResult({
    id: "scenario",
    title: "Agent Outcome Scenarios",
    cases: [
      {
        id: "scenario.package-manager-correction",
        title: "Injected memory changes package-manager decision",
        status: !withoutMemory.passed && withMemory.passed && taskSuccessDelta === 1 ? "pass" : "fail",
        summary: `withoutMemory=${withoutMemory.command}, withMemory=${withMemory.command}`,
        metrics: [
          metric("task_success_delta", taskSuccessDelta, "count"),
          metric("tokens_added_by_memory", tokensAddedByMemory, "tokens"),
          metric("candidate_rule_precision", candidateRulePrecision, "ratio"),
          metric("candidate_rule_recall", firstRule ? 1 : 0, "ratio")
        ],
        details: {
          demoRepo,
          learnedRule: firstRule?.rule ?? null,
          withoutMemory,
          withMemory
        }
      },
      {
        id: "scenario.stale-memory-exposure",
        title: "Retrieval skips superseded stale memory",
        status: staleMemoryOutcomeProtected ? "pass" : "fail",
        summary:
          `retrieved=${withRetrievedMemory.command}, stale=${withStaleMemory.command}, ` +
          `injectAll=${withInjectAllMemory.command}`,
        metrics: [metric("stale_memory_failures", staleMemoryFailures, "failures")],
        details: {
          staleMemoryId: staleRule.id,
          replacementMemoryId: currentRule.id,
          selected: staleMemoryRetrieval.selected,
          withRetrievedMemory,
          withStaleMemory,
          withInjectAllMemory
        }
      }
    ],
    metrics: [
      metric("task_success_delta", taskSuccessDelta, "count"),
      metric("tokens_added_by_memory", tokensAddedByMemory, "tokens"),
      metric("stale_memory_failures", staleMemoryFailures, "failures")
    ]
  });
}

function simulatePackageManagerAgent(prompt: string): {
  passed: boolean;
  command: "npm test" | "pnpm test";
} {
  const commandMatch = prompt.match(/use\s+`?(pnpm|npm)\s+test`?/i);
  const explicitCommand = commandMatch?.[1]?.toLowerCase();
  const fallbackPrefersPnpm =
    explicitCommand === undefined && /pnpm.+instead of.+npm|use pnpm/i.test(prompt);
  const command =
    explicitCommand === "pnpm" || fallbackPrefersPnpm ? "pnpm test" : "npm test";
  return { command, passed: command === "pnpm test" };
}

async function withoutOpenAiKey<T>(callback: () => Promise<T>): Promise<T> {
  const originalKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    return await callback();
  } finally {
    if (originalKey !== undefined) {
      process.env.OPENAI_API_KEY = originalKey;
    }
  }
}
