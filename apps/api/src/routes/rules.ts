import { type FastifyInstance } from "fastify";
import {
  createManualMemoryRequestSchema,
  createManualRuleRequestSchema,
  createSyncedMemoryRequestSchema,
  memoryRetrievalRequestSchema
} from "@signal-recycler/shared";
import { retrieveRelevantMemories } from "../services/memoryRetrieval.js";
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

  app.get("/api/memories", async () => options.store.listRules(projectId));

  app.post("/api/memories", async (request) => {
    const parsed = createManualMemoryRequestSchema.parse(request.body ?? {});
    const memory = options.store.createRuleCandidate({
      projectId,
      category: parsed.category,
      rule: parsed.rule,
      reason: parsed.reason,
      memoryType: parsed.memoryType,
      scope: parsed.scope,
      source: { kind: "manual", author: "local-user" },
      confidence: "high",
      syncStatus: "local",
      sourceEventId: null
    });
    return options.store.approveRule(memory.id);
  });

  app.post("/api/memories/synced", async (request) => {
    const parsed = createSyncedMemoryRequestSchema.parse(request.body ?? {});
    const memory = options.store.createRuleCandidate({
      projectId,
      category: parsed.category,
      rule: parsed.rule,
      reason: parsed.reason,
      memoryType: "synced_file",
      scope: parsed.scope,
      source: { kind: "synced_file", path: parsed.path, section: parsed.section },
      confidence: "high",
      syncStatus: "imported",
      sourceEventId: null
    });
    return options.store.approveRule(memory.id);
  });

  app.get("/api/memories/:id/audit", async (request, reply) => {
    const { id } = request.params as { id: string };
    const memory = options.store.getRule(id);
    if (!memory || memory.projectId !== projectId) {
      return reply.code(404).send({ error: "Memory not found" });
    }
    return {
      memory,
      usages: options.store.listMemoryUsagesForProject(projectId, id)
    };
  });

  app.get("/api/rules", async () => options.store.listRules(projectId));

  app.post("/api/memory/retrieve", async (request, reply) => {
    const parsed = memoryRetrievalRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid memory retrieval request",
        message: parsed.error.issues.map((issue) => issue.message).join("; ")
      });
    }

    const result = retrieveRelevantMemories({
      store: options.store,
      projectId,
      query: parsed.data.prompt,
      limit: parsed.data.limit
    });
    return {
      query: result.query,
      selected: result.selected,
      skipped: result.skipped,
      metrics: result.metrics
    };
  });

  app.post("/api/memory/retain", async (request) => {
    const parsed = createManualMemoryRequestSchema.parse(request.body ?? {});
    const memory = options.store.createRuleCandidate({
      projectId,
      category: parsed.category,
      rule: parsed.rule,
      reason: parsed.reason,
      memoryType: parsed.memoryType,
      scope: parsed.scope,
      source: { kind: "import", label: "api" },
      confidence: "high",
      syncStatus: "imported",
      sourceEventId: null
    });
    return options.store.approveRule(memory.id);
  });

  app.post("/api/rules", async (request, reply) => {
    const parsed = createManualRuleRequestSchema.parse(request.body ?? {});
    if (parsed.memoryType !== "rule") {
      return reply.code(400).send({
        error: "Invalid memoryType",
        message: '/api/rules only accepts memoryType "rule"'
      });
    }

    const rule = options.store.createRuleCandidate({
      projectId,
      category: parsed.category,
      rule: parsed.rule,
      reason: parsed.reason,
      memoryType: "rule",
      scope: parsed.scope,
      source: { kind: "manual", author: "local-user" },
      confidence: "high",
      syncStatus: "local",
      sourceEventId: null
    });
    return options.store.approveRule(rule.id);
  });

  app.post("/api/rules/:id/approve", async (request, reply) => {
    const { id } = request.params as { id: string };
    const rule = options.store.getRule(id);
    if (!rule || rule.projectId !== projectId) {
      return reply.code(404).send({ error: "Rule not found" });
    }
    return options.store.approveRule(id);
  });

  app.post("/api/rules/:id/reject", async (request, reply) => {
    const { id } = request.params as { id: string };
    const rule = options.store.getRule(id);
    if (!rule || rule.projectId !== projectId) {
      return reply.code(404).send({ error: "Rule not found" });
    }
    return options.store.rejectRule(id);
  });

  app.get("/api/playbook/export", async (_request, reply) => {
    return reply.type("text/markdown").send(options.store.exportPlaybook(projectId));
  });

  app.post("/api/memory/reset", async () => {
    return options.store.clearProjectMemory(projectId);
  });
}
