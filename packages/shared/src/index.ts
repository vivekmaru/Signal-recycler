import { z } from "zod";

export const ruleStatusSchema = z.enum(["pending", "approved", "rejected"]);
export type RuleStatus = z.infer<typeof ruleStatusSchema>;

export const eventCategorySchema = z.enum([
  "codex_event",
  "proxy_request",
  "compression_result",
  "classifier_result",
  "rule_candidate",
  "rule_auto_approved"
]);
export type EventCategory = z.infer<typeof eventCategorySchema>;

export const ruleSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  status: ruleStatusSchema,
  category: z.string(),
  rule: z.string(),
  reason: z.string(),
  sourceEventId: z.string().nullable(),
  createdAt: z.string(),
  approvedAt: z.string().nullable()
});
export type PlaybookRule = z.infer<typeof ruleSchema>;

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

export const ruleConfidenceSchema = z.enum(["high", "medium", "low"]);
export type RuleConfidence = z.infer<typeof ruleConfidenceSchema>;

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

export const createManualRuleRequestSchema = z.object({
  category: z.string().min(2),
  rule: z.string().min(8),
  reason: z.string().min(8)
});
