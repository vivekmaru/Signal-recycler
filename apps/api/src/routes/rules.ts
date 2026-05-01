import { type FastifyInstance } from "fastify";
import { createManualRuleRequestSchema } from "@signal-recycler/shared";
import { type SignalRecyclerStore } from "../store.js";
import { type CodexRunner } from "../types.js";

export type RouteOptions = {
  store: SignalRecyclerStore;
  codexRunner: CodexRunner;
  projectId: string;
  workingDirectory: string;
  upstreamBaseUrl?: string;
};

export async function registerRuleRoutes(
  app: FastifyInstance,
  options: RouteOptions
): Promise<void> {
  const { projectId } = options;

  app.get("/api/rules", async () => options.store.listRules(projectId));

  app.post("/api/rules", async (request) => {
    const parsed = createManualRuleRequestSchema.parse(request.body ?? {});
    const rule = options.store.createRuleCandidate({
      projectId,
      category: parsed.category,
      rule: parsed.rule,
      reason: parsed.reason,
      sourceEventId: null
    });
    return options.store.approveRule(rule.id);
  });

  app.post("/api/rules/:id/approve", async (request) => {
    const { id } = request.params as { id: string };
    return options.store.approveRule(id);
  });

  app.post("/api/rules/:id/reject", async (request) => {
    const { id } = request.params as { id: string };
    return options.store.rejectRule(id);
  });

  app.get("/api/playbook/export", async (_request, reply) => {
    return reply.type("text/markdown").send(options.store.exportPlaybook(projectId));
  });

  app.post("/api/memory/reset", async () => {
    return options.store.clearProjectMemory(projectId);
  });
}
