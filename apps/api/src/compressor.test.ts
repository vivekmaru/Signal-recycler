import { describe, expect, it } from "vitest";
import { compressHistory } from "./compressor.js";

describe("compressor", () => {
  it("should not compress '0 errors' output", () => {
    const output = "Successfully finished build. Found 0 errors and 0 failures." + ".".repeat(2000);
    const items = [{ type: "shell_call_output", output }];
    const result = compressHistory(items);
    
    expect(result.compressions).toBe(0);
    expect(result.items[0]).toEqual(items[0]);
  });

  it("should preserve the error if it is at the end of the output", () => {
    // 2000 dots + error at the end. Total ~2025 chars.
    // KEEP_HEAD(400) + KEEP_TAIL(400) = 800 kept.
    // Error is in the last 400 chars, so it should be preserved.
    const head = "Starting process...\n" + ".".repeat(2000) + "\n";
    const error = "CRITICAL ERROR: Disk full";
    const output = head + error;
    const items = [{ type: "shell_call_output", output }];
    const result = compressHistory(items);
    
    expect(result.compressions).toBe(1);
    const compressedOutput = (result.items[0] as any).output;
    expect(compressedOutput).toContain(error);
    expect(compressedOutput).toContain("Starting process...");
    expect(compressedOutput).toContain("[Signal Recycler: compressed");
  });

  it("should not compress if net savings are too small", () => {
    // Length = 850. KEEP_HEAD(400) + KEEP_TAIL(400) = 800.
    // rawRemoved = 50. Overhead marker is > 50 chars.
    // netRemoved will be negative or below MIN_SAVING(200).
    const output = "error: " + ".".repeat(843);
    const items = [{ type: "shell_call_output", output }];
    const result = compressHistory(items);
    
    expect(result.compressions).toBe(0);
    expect(result.charsRemoved).toBe(0);
  });

  it("should accurately report net characters removed", () => {
    const output = "error: " + ".".repeat(2000);
    const items = [{ type: "shell_call_output", output }];
    const result = compressHistory(items);
    
    const compressedOutput = (result.items[0] as any).output;
    const expectedRawRemoved = output.length - 800; // head(400) + tail(400)
    const marker = `\n… [Signal Recycler: compressed ${expectedRawRemoved} chars of noise] …\n`;
    const expectedNetRemoved = expectedRawRemoved - marker.length;
    
    expect(result.charsRemoved).toBe(expectedNetRemoved);
    expect(compressedOutput.length).toBe(output.length - expectedNetRemoved);
  });
});
