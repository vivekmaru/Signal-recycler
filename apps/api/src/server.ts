import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { configureHttpRuntime } from "./http.js";
import { createAgentAdapterRegistry } from "./services/agentAdapters.js";
import { createCodexSdkAdapter } from "./services/codexSdkAdapter.js";
import { createStore } from "./store.js";

loadDotEnv(path.resolve(process.cwd(), "../../.env"));
loadDotEnv(path.resolve(process.cwd(), ".env"));
configureHttpRuntime();

const port = Number(process.env.PORT ?? 3001);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const dbPath = process.env.SIGNAL_RECYCLER_DB ?? path.join(repoRoot, "signal-recycler.sqlite");

// Which directory Codex should work in. Defaults to the repo root so Signal
// Recycler can demo on itself — set SIGNAL_RECYCLER_WORKDIR to point at any
// other project you want to run Codex against.
const workingDirectory = process.env.SIGNAL_RECYCLER_WORKDIR
  ? path.resolve(process.env.SIGNAL_RECYCLER_WORKDIR)
  : repoRoot;

// Logical project name used to namespace rules and sessions in the DB.
const projectId =
  process.env.SIGNAL_RECYCLER_PROJECT_ID ?? path.basename(workingDirectory);

const store = createStore(dbPath);
const codexSdkAdapter = createCodexSdkAdapter({ store, apiPort: port, projectId, workingDirectory });
const agentAdapterRegistry = createAgentAdapterRegistry({
  defaultAdapter: "codex_sdk",
  adapters: { codex_sdk: codexSdkAdapter }
});
const app = await createApp({
  store,
  projectId,
  workingDirectory,
  databasePath: dbPath,
  codexRunner: codexSdkAdapter,
  agentAdapterRegistry
});

await app.listen({ port, host: "127.0.0.1" });
console.log(`Signal Recycler API listening on http://127.0.0.1:${port}`);
console.log(`  Project:   ${projectId}`);
console.log(`  Workdir:   ${workingDirectory}`);

function loadDotEnv(filePath: string): void {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
