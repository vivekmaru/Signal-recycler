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
          content:
            "Classify this Codex turn into signal, noise, failure, and durable project rules. Only propose rules that should affect future Codex work."
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
                  required: ["category", "rule", "reason"],
                  properties: {
                    category: { type: "string" },
                    rule: { type: "string" },
                    reason: { type: "string" }
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
  const text = `${input.prompt}\n${input.finalResponse}`.toLowerCase();
  const signal: string[] = [];
  const noise: string[] = [];
  const failure: string[] = [];
  const candidateRules: ClassifierResult["candidateRules"] = [];

  if (text.includes("pnpm")) {
    signal.push("The turn references pnpm as a project-specific workflow constraint.");
  }
  if (text.includes("npm") && text.includes("fail")) {
    failure.push("The turn describes an npm-based failure.");
    candidateRules.push({
      category: "tooling",
      rule: "Use pnpm instead of npm for package and script operations in this repo.",
      reason: "A previous Codex run hit an npm path that was corrected to pnpm."
    });
  }
  if (text.includes("corrected") || text.includes("instead")) {
    signal.push("The user correction should be converted into durable project memory.");
  }
  if (input.items.length > 0) {
    noise.push(`${input.items.length} raw Codex item(s) collapsed into a turn summary.`);
  }

  return { signal, noise, failure, candidateRules };
}
