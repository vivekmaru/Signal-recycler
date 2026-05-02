import { type AgentAdapter } from "../types.js";

export function createMockAdapter(): AgentAdapter {
  return {
    id: "mock",
    async run(input) {
      return {
        finalResponse: input.prompt.includes("<signal-recycler-playbook>")
          ? "Checking learned constraints from playbook... Applying rules before proceeding."
          : "Encountered a failure. The correction should be captured as a durable rule.",
        items: [{ type: "mock", injected: input.prompt }]
      };
    }
  };
}
