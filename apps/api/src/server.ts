import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { createCodexRunner } from "./codexRunner.js";
import { configureHttpRuntime } from "./http.js";
import { createStore } from "./store.js";

loadDotEnv(path.resolve(process.cwd(), "../../.env"));
loadDotEnv(path.resolve(process.cwd(), ".env"));
configureHttpRuntime();

const port = Number(process.env.PORT ?? 3001);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const dbPath = process.env.SIGNAL_RECYCLER_DB ?? path.join(root, "signal-recycler.sqlite");
const store = createStore(dbPath);
const app = await createApp({
  store,
  codexRunner: createCodexRunner({ store, apiPort: port })
});

await app.listen({ port, host: "127.0.0.1" });
console.log(`Signal Recycler API listening on http://127.0.0.1:${port}`);

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
