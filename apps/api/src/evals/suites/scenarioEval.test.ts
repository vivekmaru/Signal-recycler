import { describe, expect, it } from "vitest";
import { runScenarioEval } from "./scenarioEval.js";

describe("scenario eval", () => {
  it("proves injected memory can change the deterministic outcome", async () => {
    const result = await runScenarioEval();
    const correction = result.cases.find(
      (testCase) => testCase.id === "scenario.package-manager-correction"
    );

    expect(correction?.status).toBe("pass");
    expect(correction?.metrics).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "task_success_delta", value: 1 })])
    );
  });
});
