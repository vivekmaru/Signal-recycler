import { injectIntoRequestBody } from "../../playbook.js";
import { metric, suiteResult } from "../report.js";
import { type EvalCaseResult, type EvalSuiteResult } from "../types.js";

const rule = {
  id: "rule_eval",
  category: "tooling",
  rule: "Use pnpm instead of npm in fixtures/demo-repo."
};

type InjectionCase = {
  id: string;
  title: string;
  run: () => unknown;
};

export function runInjectionEval(): EvalSuiteResult {
  const inputs: InjectionCase[] = [
    {
      id: "responses-input-string",
      title: "Injects into Responses API input string",
      run: () => injectIntoRequestBody({ input: "Validate the repo." }, [rule])
    },
    {
      id: "chat-messages",
      title: "Injects into chat messages system position",
      run: () => injectIntoRequestBody({ messages: [{ role: "user", content: "Validate." }] }, [rule])
    },
    {
      id: "dedupe-existing-playbook",
      title: "Dedupes existing playbook block",
      run: () =>
        injectIntoRequestBody(
          {
            input:
              "<signal-recycler-playbook>\nold\n</signal-recycler-playbook>\n\nValidate the repo."
          },
          [rule]
        )
    }
  ];

  const cases: EvalCaseResult[] = inputs.map((testCase) => {
    const body = testCase.run();
    const serialized = JSON.stringify(body);
    const occurrences = serialized.match(/Signal Recycler Playbook/g)?.length ?? 0;
    const status = occurrences === 1 && serialized.includes(rule.rule) ? "pass" : "fail";
    return {
      id: `injection.${testCase.id}`,
      title: testCase.title,
      status,
      summary: `playbookOccurrences=${occurrences}`,
      metrics: [metric("playbook_occurrences", occurrences, "blocks")],
      details: { body }
    };
  });

  return suiteResult({
    id: "injection",
    title: "Playbook Injection",
    cases,
    metrics: [metric("injection_cases", cases.length, "cases")]
  });
}
