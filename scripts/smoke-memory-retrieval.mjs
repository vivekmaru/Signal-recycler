const base = process.env.SIGNAL_RECYCLER_API_URL ?? "http://127.0.0.1:3001";

async function request(path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (options.body !== undefined) headers["content-type"] = "application/json";

  const response = await fetch(`${base}${path}`, { headers, ...options });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  return contentType.includes("application/json") ? response.json() : response.text();
}

const config = await request("/api/config");
if (!process.env.SIGNAL_RECYCLER_ALLOW_SHARED_SMOKE_DB && !config.database?.isSmoke) {
  const databaseName = config.database?.basename ?? "unknown database";
  throw new Error(
    `Refusing to run memory smoke against ${databaseName}. Start the API with SIGNAL_RECYCLER_DB pointing at a temporary smoke database, or set SIGNAL_RECYCLER_ALLOW_SHARED_SMOKE_DB=1.`
  );
}

await request("/api/memory/reset", { method: "POST" });

const theme = await request("/api/memories", {
  method: "POST",
  body: JSON.stringify({
    category: "theme",
    rule: "Use approved theme tokens for UI theme changes.",
    reason: "Theme work follows the design system.",
    memoryType: "preference",
    scope: { type: "project", value: null }
  })
});

const packageManager = await request("/api/memories", {
  method: "POST",
  body: JSON.stringify({
    category: "package-manager",
    rule: "Use pnpm test instead of npm test.",
    reason: "This repo uses pnpm workspaces.",
    memoryType: "command_convention",
    scope: { type: "project", value: null }
  })
});

const session = await request("/api/sessions", {
  method: "POST",
  body: JSON.stringify({ title: "Memory retrieval smoke" })
});

const run = await request(`/api/sessions/${session.id}/run`, {
  method: "POST",
  body: JSON.stringify({ prompt: "Run package manager validation for this repo." })
});

const events = await request(`/api/sessions/${session.id}/events`);
const retrievalEvents = events.filter((event) => event.category === "memory_retrieval");
const injectionEvents = events.filter((event) => event.category === "memory_injection");
const selected = retrievalEvents.flatMap((event) => event.metadata?.selected ?? []);
const injectedIds = injectionEvents.flatMap((event) => event.metadata?.memoryIds ?? []);

if (run.candidateRules.length !== 0) {
  throw new Error(`Expected no new candidate rules; found ${run.candidateRules.length}.`);
}
if (retrievalEvents.length !== 1) {
  throw new Error(`Expected exactly 1 retrieval event; found ${retrievalEvents.length}.`);
}
if (injectionEvents.length !== 1) {
  throw new Error(`Expected exactly 1 injection event; found ${injectionEvents.length}.`);
}
if (!selected.some((memory) => memory.memoryId === packageManager.id)) {
  throw new Error("Expected package-manager memory to be selected.");
}
if (selected.some((memory) => memory.memoryId === theme.id)) {
  throw new Error("Expected theme memory not to be selected.");
}
if (injectedIds.length !== 1 || injectedIds[0] !== packageManager.id) {
  throw new Error(
    `Expected only package-manager memory to be injected; got ${injectedIds.join(", ")}.`
  );
}

console.log(
  JSON.stringify(
    {
      sessionId: session.id,
      selectedMemories: selected.map((memory) => memory.memoryId),
      injectedMemoryIds: injectedIds,
      candidateRules: run.candidateRules.length
    },
    null,
    2
  )
);
