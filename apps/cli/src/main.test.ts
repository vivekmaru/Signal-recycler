import { describe, expect, it } from "vitest";
import { usage } from "./main.js";

describe("main helpers", () => {
  it("documents sr run usage", () => {
    expect(usage()).toContain("sr run");
    expect(usage()).toContain("--session");
    expect(usage()).toContain("--agent");
  });
});
