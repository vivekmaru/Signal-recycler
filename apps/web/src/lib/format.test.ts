import { describe, expect, it } from "vitest";
import { formatDateTime, formatDuration } from "./format";

describe("format helpers", () => {
  it("guards malformed timestamps", () => {
    expect(formatDateTime("not-a-date")).toBe("—");
    expect(formatDuration("not-a-date", "2026-05-03T00:02:00.000Z")).toBe("0s");
    expect(formatDuration("2026-05-03T00:00:00.000Z", "not-a-date")).toBe("0s");
  });
});
