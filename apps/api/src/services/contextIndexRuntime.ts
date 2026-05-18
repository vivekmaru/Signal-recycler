import {
  createContextIndexStore,
  type ContextIndexStore
} from "./contextIndexStore.js";

export type LazyContextIndexStore = {
  get(): { ok: true; value: ContextIndexStore } | { ok: false; error: Error };
  close(): void;
};

export function createLazyContextIndexStore(options: {
  dbPath: string;
  storeFactory?: (path: string) => ContextIndexStore;
}): LazyContextIndexStore {
  const factory = options.storeFactory ?? createContextIndexStore;
  let store: ContextIndexStore | null = null;

  return {
    get(): { ok: true; value: ContextIndexStore } | { ok: false; error: Error } {
      if (store) return { ok: true, value: store };
      try {
        store = factory(options.dbPath);
        return { ok: true, value: store };
      } catch (error) {
        return { ok: false, error: normalizeError(error) };
      }
    },
    close(): void {
      store?.close();
      store = null;
    }
  };
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  return new Error("Unknown error");
}
