import { classifyTurn } from "../classifier.js";
import { type SignalRecyclerStore } from "../store.js";
import { type CodexRunner } from "../types.js";

export type ProcessTurnInput = {
  store: SignalRecyclerStore;
  codexRunner: CodexRunner;
  projectId: string;
  sessionId: string;
  prompt: string;
  workingDirectory?: string;
  classifyTitle?: string;
};

export async function processTurn(input: ProcessTurnInput): Promise<{
  finalResponse: string;
  items: unknown[];
  candidateRules: ReturnType<SignalRecyclerStore["listRules"]>;
}> {
  const turn = await input.codexRunner.run({
    sessionId: input.sessionId,
    prompt: input.prompt,
    ...(input.workingDirectory ? { workingDirectory: input.workingDirectory } : {})
  });

  const codexEvent = input.store.createEvent({
    sessionId: input.sessionId,
    category: "codex_event",
    title: "Codex response",
    body: turn.finalResponse,
    metadata: { items: turn.items.length }
  });

  const classification = await classifyTurn({
    prompt: input.prompt,
    finalResponse: turn.finalResponse,
    items: turn.items
  });

  input.store.createEvent({
    sessionId: input.sessionId,
    category: "classifier_result",
    title: input.classifyTitle ?? "Mark and distill complete",
    body: `${classification.signal.length} signal, ${classification.noise.length} noise, ${classification.failure.length} failure`,
    metadata: classification
  });

  const candidateRules = classification.candidateRules.map((candidate) => {
    let rule = input.store.createRuleCandidate({
      projectId: input.projectId,
      category: candidate.category,
      rule: candidate.rule,
      reason: candidate.reason,
      sourceEventId: codexEvent.id
    });

    input.store.createEvent({
      sessionId: input.sessionId,
      category: "rule_candidate",
      title: "Rule candidate created",
      body: candidate.rule,
      metadata: {
        ruleId: rule.id,
        reason: candidate.reason,
        category: candidate.category,
        confidence: candidate.confidence
      }
    });

    if (candidate.confidence === "high") {
      rule = input.store.approveRule(rule.id);
      input.store.createEvent({
        sessionId: input.sessionId,
        category: "rule_auto_approved",
        title: "Rule auto-approved",
        body: candidate.rule,
        metadata: {
          ruleId: rule.id,
          confidence: candidate.confidence,
          category: candidate.category
        }
      });
    }

    return rule;
  });

  return { finalResponse: turn.finalResponse, items: turn.items, candidateRules };
}
