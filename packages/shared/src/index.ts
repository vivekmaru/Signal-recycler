import { z } from "zod";

export const ruleStatusSchema = z.enum(["pending", "approved", "rejected"]);
export type RuleStatus = z.infer<typeof ruleStatusSchema>;

export const memoryStatusSchema = ruleStatusSchema;
export type MemoryStatus = z.infer<typeof memoryStatusSchema>;

export const memoryTypeSchema = z.enum([
  "rule",
  "preference",
  "project_fact",
  "command_convention",
  "source_derived",
  "synced_file"
]);
export type MemoryType = z.infer<typeof memoryTypeSchema>;

export const memoryConfidenceSchema = z.enum(["high", "medium", "low"]);
export type MemoryConfidence = z.infer<typeof memoryConfidenceSchema>;

export const memorySyncStatusSchema = z.enum(["local", "imported", "exported", "synced"]);
export type MemorySyncStatus = z.infer<typeof memorySyncStatusSchema>;

export const memoryScopeSchema = z.object({
  type: z.enum(["project", "repo_path", "package", "file", "agent", "user"]),
  value: z.string().nullable()
});
export type MemoryScope = z.infer<typeof memoryScopeSchema>;

export const memorySourceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("manual"),
    author: z.string().min(1)
  }),
  z.object({
    kind: z.literal("event"),
    sessionId: z.string().min(1),
    eventId: z.string().min(1)
  }),
  z.object({
    kind: z.literal("synced_file"),
    path: z.enum(["AGENTS.md", "CLAUDE.md"]),
    section: z.string().nullable()
  }),
  z.object({
    kind: z.literal("import"),
    label: z.string().min(1)
  }),
  z.object({
    kind: z.literal("source_chunk"),
    path: z.string().min(1),
    lineStart: z.number().int().positive().nullable(),
    lineEnd: z.number().int().positive().nullable()
  })
]);
export type MemorySource = z.infer<typeof memorySourceSchema>;

export const eventCategorySchema = z.enum([
  "codex_event",
  "proxy_request",
  "compression_result",
  "classifier_result",
  "rule_candidate",
  "rule_auto_approved",
  "memory_injection"
]);
export type EventCategory = z.infer<typeof eventCategorySchema>;

export const memoryRecordSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  status: memoryStatusSchema,
  category: z.string(),
  rule: z.string(),
  reason: z.string(),
  sourceEventId: z.string().nullable(),
  createdAt: z.string(),
  approvedAt: z.string().nullable(),
  memoryType: memoryTypeSchema,
  scope: memoryScopeSchema,
  source: memorySourceSchema,
  confidence: memoryConfidenceSchema,
  lastUsedAt: z.string().nullable(),
  supersededBy: z.string().nullable(),
  syncStatus: memorySyncStatusSchema,
  updatedAt: z.string()
});
export type MemoryRecord = z.infer<typeof memoryRecordSchema>;

export const ruleSchema = memoryRecordSchema;
export type PlaybookRule = MemoryRecord;

export const sessionSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  createdAt: z.string()
});
export type SessionRecord = z.infer<typeof sessionSchema>;

export const eventSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  category: eventCategorySchema,
  title: z.string(),
  body: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string()
});
export type TimelineEvent = z.infer<typeof eventSchema>;

export const memoryUsageSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  memoryId: z.string(),
  sessionId: z.string(),
  eventId: z.string(),
  adapter: z.string(),
  reason: z.string(),
  injectedAt: z.string()
});
export type MemoryUsage = z.infer<typeof memoryUsageSchema>;

export const ruleConfidenceSchema = memoryConfidenceSchema;
export type RuleConfidence = MemoryConfidence;

export const candidateRuleSchema = z.object({
  category: z.string().min(2),
  rule: z.string().min(8),
  reason: z.string().min(8),
  confidence: ruleConfidenceSchema.optional().default("medium")
});
export type CandidateRule = z.infer<typeof candidateRuleSchema>;

export const classifierResultSchema = z.object({
  signal: z.array(z.string()),
  noise: z.array(z.string()),
  failure: z.array(z.string()),
  candidateRules: z.array(candidateRuleSchema)
});
export type ClassifierResult = z.infer<typeof classifierResultSchema>;

export const runRequestSchema = z.object({
  prompt: z.string().min(1)
});

export const createSessionRequestSchema = z.object({
  title: z.string().min(1).optional()
});

export const createManualMemoryRequestSchema = z.object({
  category: z.string().min(2),
  rule: z.string().min(8),
  reason: z.string().min(8),
  memoryType: memoryTypeSchema.default("rule"),
  scope: memoryScopeSchema.default({ type: "project", value: null })
});

export const createManualRuleRequestSchema = createManualMemoryRequestSchema;

export const createSyncedMemoryRequestSchema = z.object({
  category: z.string().min(2),
  rule: z.string().min(8),
  reason: z.string().min(8),
  path: z.enum(["AGENTS.md", "CLAUDE.md"]),
  section: z.string().nullable().default(null),
  scope: memoryScopeSchema.default({ type: "project", value: null })
});
