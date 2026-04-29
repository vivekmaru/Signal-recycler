import OpenAI from "openai";
import {
  type ClassifierResult,
  classifierResultSchema
} from "@signal-recycler/shared";

export function parseClassifierResult(value: unknown): ClassifierResult {
  return classifierResultSchema.parse(value);
}

export async function classifyTurn(input: {
  prompt: string;
  finalResponse: string;
  items: unknown[];
}): Promise<ClassifierResult> {
  if (!process.env.OPENAI_API_KEY) {
    return heuristicClassify(input);
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: process.env.SIGNAL_RECYCLER_CLASSIFIER_MODEL ?? "gpt-5.1-mini",
      input: [
        {
          role: "system",
          content: [
            "Classify this Codex turn for Signal Recycler.",
            "",
            "RULES:",
            "- Only mark something as `failure` if Codex itself hit a real, blocking error this turn AND you can extract a durable rule from it.",
            "- Do NOT mark intentional failures, expected error logs, or natural-language descriptions of past failures as failures.",
            "- `noise` is for low-value content you would strip before re-running (large stack traces, redundant tool outputs).",
            "- `signal` is for durable observations about the project worth remembering.",
            "- `candidateRules` MUST be non-empty when `failure` is non-empty. If you cannot extract a clear, generalizable rule from a failure, do not list it as a failure.",
            "- Each rule must include `confidence`: `high` if the rule is unambiguous and directly stated by the turn (e.g. an explicit correction); `medium` if it is a strong inference; `low` for tentative observations."
          ].join("\n")
        },
        {
          role: "user",
          content: JSON.stringify(input)
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "signal_recycler_classifier",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["signal", "noise", "failure", "candidateRules"],
            properties: {
              signal: { type: "array", items: { type: "string" } },
              noise: { type: "array", items: { type: "string" } },
              failure: { type: "array", items: { type: "string" } },
              candidateRules: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["category", "rule", "reason", "confidence"],
                  properties: {
                    category: { type: "string" },
                    rule: { type: "string" },
                    reason: { type: "string" },
                    confidence: { type: "string", enum: ["high", "medium", "low"] }
                  }
                }
              }
            }
          }
        }
      }
    });

    return parseClassifierResult(JSON.parse(response.output_text));
  } catch (error) {
    return {
      ...heuristicClassify(input),
      noise: [`Classifier API fallback: ${(error as Error).message}`]
    };
  }
}

function heuristicClassify(input: {
  prompt: string;
  finalResponse: string;
  items: unknown[];
}): ClassifierResult {
  const text = `${input.prompt}\n${input.finalResponse}`;
  const lower = text.toLowerCase();
  const signal: string[] = [];
  const noise: string[] = [];
  const failure: string[] = [];
  const candidateRules: ClassifierResult["candidateRules"] = [];

  // Detect explicit corrections or constraint discoveries
  if (/instead|corrected|should use|prefer|avoid|don't use|do not use/i.test(text)) {
    signal.push("The turn contains a correction or constraint discovery worth preserving.");
  }

  // Detect command/tool failures that led to a correction
  const failurePatterns: Array<{ pattern: RegExp; category: string; extract: (m: RegExpMatchArray) => string | null }> = [
    {
      // "use X instead of Y" — explicit replacement
      pattern: /use (\w+) instead of (\w+)/i,
      category: "tooling",
      extract: (m) => `Use ${m[1]} instead of ${m[2]} for operations in this repo.`
    },
    {
      // "corrected (me) to use X instead" — implicit correction with ellipsis between tokens
      pattern: /corrected .{0,20}use (\w+(?:\s\w+)*?) instead/i,
      category: "tooling",
      extract: (m) => `Use ${m[1]?.trim()} — a previous attempt with an alternative was corrected.`
    },
    {
      pattern: /(\w+)\s+(?:is|was)\s+(?:not found|unavailable|missing)/i,
      category: "environment",
      extract: (m) => `${m[1]} is not available in this environment — use an alternative.`
    },
    {
      pattern: /must (?:use|run|install|set) ([^\.\n]{5,60})/i,
      category: "convention",
      extract: (m) => `Project convention: must ${m[1]?.trim()}.`
    }
  ]

  for (const { pattern, category, extract } of failurePatterns) {
    const match = text.match(pattern)
    if (match) {
      const rule = extract(match)
      if (rule) {
        failure.push(`Detected a correctable failure pattern: "${match[0]}".`)
        candidateRules.push({
          category,
          rule,
          reason: `Extracted from Codex turn: "${match[0]}".`,
          confidence: "high"
        })
      }
    }
  }

  // Only mark "failure" when we actually extracted a candidate rule from it.
  // Otherwise we trip on assistant prose that merely *describes* failures
  // (e.g. "this test intentionally throws 401 to verify error handling").

  if (input.items.length > 0) {
    noise.push(`${input.items.length} raw Codex item(s) collapsed into this turn summary.`);
  }

  return { signal, noise, failure, candidateRules };
}
