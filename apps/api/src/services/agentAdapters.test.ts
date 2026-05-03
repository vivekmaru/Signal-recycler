import { describe, expect, it } from "vitest";
import { createAgentAdapterRegistry } from "./agentAdapters.js";

describe("agent adapter registry", () => {
  it("resolves the configured default adapter to mock", async () => {
    const registry = createAgentAdapterRegistry({ defaultAdapter: "mock" });

    const adapter = registry.resolve("default");
    const result = await adapter.run({ sessionId: "session-1", prompt: "Run validation." });

    expect(adapter.id).toBe("mock");
    expect(result).toEqual({
      finalResponse: "Encountered a failure. The correction should be captured as a durable rule.",
      items: [{ type: "mock", injected: "Run validation." }]
    });
  });

  it("throws a clear error when codex_cli is unavailable", () => {
    const registry = createAgentAdapterRegistry({ defaultAdapter: "mock" });

    expect(() => registry.resolve("codex_cli")).toThrow("Codex CLI adapter is not configured");
  });

  it("lists only adapters backed by configured implementations", () => {
    const registry = createAgentAdapterRegistry({
      defaultAdapter: "mock",
      adapters: { codex_cli: undefined }
    });

    expect(registry.listAvailable()).toEqual(["default", "mock"]);
  });
});
