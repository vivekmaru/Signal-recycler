import { describe, expect, it } from "vitest";
import { isDirectRunPath, usage } from "./main.js";

describe("main helpers", () => {
  it("documents sr run usage", () => {
    expect(usage()).toContain("sr run");
    expect(usage()).toContain("--session");
    expect(usage()).toContain("--agent");
  });

  it("detects direct runs through a symlinked package binary", () => {
    const modulePath = "/repo/apps/cli/dist/main.js";
    const symlinkPath = "/repo/node_modules/.bin/sr";

    expect(
      isDirectRunPath(modulePath, symlinkPath, (value) => {
        if (value === symlinkPath) return modulePath;
        return value;
      })
    ).toBe(true);
  });
});
