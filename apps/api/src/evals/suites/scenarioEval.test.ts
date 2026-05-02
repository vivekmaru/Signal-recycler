import { afterEach, describe, expect, it, vi } from "vitest";
import { runScenarioEval } from "./scenarioEval.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

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

  it("stays offline and restores OPENAI_API_KEY when the developer environment has one", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-present-in-dev-shell");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("scenario eval must not call the network");
      })
    );

    const result = await runScenarioEval();

    expect(result.status).toBe("pass");
    expect(process.env.OPENAI_API_KEY).toBe("sk-test-present-in-dev-shell");
    expect(fetch).not.toHaveBeenCalled();
  });
});
