import fs from "node:fs";
import path from "node:path";
import { type FastifyInstance } from "fastify";
import { classifyTurn } from "../classifier.js";
import { type SignalRecyclerStore } from "../store.js";
import { type CodexRunner } from "../types.js";

export type RouteOptions = {
  store: SignalRecyclerStore;
  codexRunner: CodexRunner;
  projectId: string;
  workingDirectory: string;
  upstreamBaseUrl?: string;
};

export async function registerDemoRoutes(
  app: FastifyInstance,
  options: RouteOptions
): Promise<void> {
  app.post("/api/demo/run", async (_request, reply) => {
    const fixtureDir = findFixtureDir(options.workingDirectory);
    if (!fixtureDir) {
      return reply.code(500).send({
        error: "Demo fixture not found",
        message:
          "Expected fixtures/demo-repo at the repo root. The demo button needs the bundled fixture to demonstrate a deterministic teach→use arc."
      });
    }

    const teachPrompt =
      "Validate this project by running `npm test`. Report exactly what happens, including any error messages, and explain the correction needed if it fails.";
    const usePrompt =
      "Validate this project by running its test suite. Before running anything, follow any injected playbook rules.";

    const teachSession = options.store.createSession({
      projectId: options.projectId,
      title: `Demo phase 1 — ${path.basename(fixtureDir)}`
    });
    const phase1Start = Date.now();
    let phase1: Awaited<ReturnType<CodexRunner["run"]>>;
    try {
      phase1 = await options.codexRunner.run({
        sessionId: teachSession.id,
        prompt: teachPrompt,
        workingDirectory: fixtureDir
      });
    } catch (error) {
      return reply.code(502).send({
        error: "Demo phase 1 failed",
        message: (error as Error).message
      });
    }
    const phase1Duration = Date.now() - phase1Start;
    const phase1Event = options.store.createEvent({
      sessionId: teachSession.id,
      category: "codex_event",
      title: "Phase 1 (teach) — Codex response",
      body: phase1.finalResponse,
      metadata: { items: phase1.items.length, phase: "teach" }
    });
    const phase1Classification = await classifyTurn({
      prompt: teachPrompt,
      finalResponse: phase1.finalResponse,
      items: phase1.items
    });
    options.store.createEvent({
      sessionId: teachSession.id,
      category: "classifier_result",
      title: "Phase 1 — distillation complete",
      body: `${phase1Classification.signal.length} signal, ${phase1Classification.noise.length} noise, ${phase1Classification.failure.length} failure`,
      metadata: phase1Classification
    });

    for (const candidate of phase1Classification.candidateRules) {
      let rule = options.store.createRuleCandidate({
        projectId: options.projectId,
        category: candidate.category,
        rule: candidate.rule,
        reason: candidate.reason,
        sourceEventId: phase1Event.id
      });
      if (rule.status !== "approved") {
        rule = options.store.approveRule(rule.id);
      }
      options.store.createEvent({
        sessionId: teachSession.id,
        category: "rule_auto_approved",
        title: "Rule auto-approved (demo)",
        body: candidate.rule,
        metadata: {
          ruleId: rule.id,
          confidence: candidate.confidence,
          category: candidate.category
        }
      });
    }

    const useSession = options.store.createSession({
      projectId: options.projectId,
      title: `Demo phase 2 — ${path.basename(fixtureDir)}`
    });
    const phase2Start = Date.now();
    let phase2: Awaited<ReturnType<CodexRunner["run"]>>;
    try {
      phase2 = await options.codexRunner.run({
        sessionId: useSession.id,
        prompt: usePrompt,
        workingDirectory: fixtureDir
      });
    } catch (error) {
      return reply.code(502).send({
        error: "Demo phase 2 failed",
        message: (error as Error).message
      });
    }
    const phase2Duration = Date.now() - phase2Start;
    options.store.createEvent({
      sessionId: useSession.id,
      category: "codex_event",
      title: "Phase 2 (use) — Codex response",
      body: phase2.finalResponse,
      metadata: { items: phase2.items.length, phase: "use" }
    });

    return {
      phase1: {
        sessionId: teachSession.id,
        prompt: teachPrompt,
        finalResponse: phase1.finalResponse,
        items: phase1.items.length,
        durationMs: phase1Duration,
        rulesCreated: phase1Classification.candidateRules.length
      },
      phase2: {
        sessionId: useSession.id,
        prompt: usePrompt,
        finalResponse: phase2.finalResponse,
        items: phase2.items.length,
        durationMs: phase2Duration
      }
    };
  });
}

function findFixtureDir(workingDirectory: string): string | null {
  const candidates = [
    path.resolve(workingDirectory, "fixtures/demo-repo"),
    path.resolve(workingDirectory, "..", "fixtures/demo-repo"),
    path.resolve(workingDirectory, "../..", "fixtures/demo-repo"),
    path.resolve(workingDirectory, "../../..", "fixtures/demo-repo")
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;
  }
  return null;
}
