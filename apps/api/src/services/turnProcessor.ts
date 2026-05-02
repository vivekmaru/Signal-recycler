import { type CandidateRule, type MemoryRecord } from "@signal-recycler/shared";
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

  const approvedMemories = input.store.listApprovedRules(input.projectId);
  const newCandidates = classification.candidateRules.filter(
    (candidate) => !isCoveredByApprovedMemory(candidate, approvedMemories)
  );

  const candidateRules = newCandidates.map((candidate) => {
    let rule = input.store.createRuleCandidate({
      projectId: input.projectId,
      category: candidate.category,
      rule: candidate.rule,
      reason: candidate.reason,
      sourceEventId: codexEvent.id,
      source: { kind: "event", sessionId: input.sessionId, eventId: codexEvent.id },
      confidence: candidate.confidence,
      memoryType: "rule",
      scope: { type: "project", value: null },
      syncStatus: "local"
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

function isCoveredByApprovedMemory(candidate: CandidateRule, memories: MemoryRecord[]): boolean {
  const candidateRule = normalizeMemoryText(candidate.rule);
  const candidateReason = normalizeMemoryText(candidate.reason);
  const candidateCorrection = commandCorrection(candidate.rule);

  return memories.some((memory) => {
    const memoryRule = normalizeMemoryText(memory.rule);
    if (candidateRule === memoryRule) return true;
    if (candidateReason.includes(memoryRule)) return true;

    const memoryCorrection = commandCorrection(memory.rule);
    return (
      candidateCorrection !== null &&
      memoryCorrection !== null &&
      candidateCorrection.preferred === memoryCorrection.preferred &&
      candidateCorrection.rejected === memoryCorrection.rejected
    );
  });
}

function normalizeMemoryText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[`'"]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function commandCorrection(value: string): { preferred: string; rejected: string } | null {
  const match = normalizeMemoryText(value).match(
    /\buse\s+(\w[\w.-]*)(?:\s+\w[\w.-]*)?\s+instead\s+of\s+(\w[\w.-]*)/
  );
  if (!match?.[1] || !match[2]) return null;
  return { preferred: match[1], rejected: match[2] };
}
