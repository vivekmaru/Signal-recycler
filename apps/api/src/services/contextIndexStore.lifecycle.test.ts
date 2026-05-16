import { afterEach, describe, expect, it, vi } from "vitest";

describe("context index store lifecycle", () => {
  afterEach(() => {
    vi.doUnmock("node:sqlite");
    vi.resetModules();
  });

  it("closes the database handle when schema setup fails", async () => {
    const close = vi.fn();
    const exec = vi.fn(() => {
      throw new Error("no such module: fts5");
    });
    const DatabaseSync = vi.fn(function DatabaseSync() {
      return { close, exec };
    });
    vi.doMock("node:sqlite", () => ({ DatabaseSync }));

    const { createContextIndexStore } = await import("./contextIndexStore.js");

    expect(() => createContextIndexStore(":memory:")).toThrow("no such module: fts5");
    expect(DatabaseSync).toHaveBeenCalledWith(":memory:");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("preserves the schema setup error when cleanup also fails", async () => {
    const close = vi.fn(() => {
      throw new Error("close failed");
    });
    const exec = vi.fn(() => {
      throw new Error("no such module: fts5");
    });
    const DatabaseSync = vi.fn(function DatabaseSync() {
      return { close, exec };
    });
    vi.doMock("node:sqlite", () => ({ DatabaseSync }));

    const { createContextIndexStore } = await import("./contextIndexStore.js");

    expect(() => createContextIndexStore(":memory:")).toThrow("no such module: fts5");
    expect(close).toHaveBeenCalledTimes(1);
  });
});
