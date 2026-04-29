import { Agent, setGlobalDispatcher } from "undici";

export function configureHttpRuntime(): void {
  const connectTimeout = Number(process.env.SIGNAL_RECYCLER_CONNECT_TIMEOUT_MS ?? 60000);

  setGlobalDispatcher(
    new Agent({
      connect: {
        timeout: connectTimeout
      },
      headersTimeout: connectTimeout,
      bodyTimeout: 120000
    })
  );
}
