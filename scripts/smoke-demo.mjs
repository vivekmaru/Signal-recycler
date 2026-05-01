const base = process.env.SIGNAL_RECYCLER_API_URL ?? "http://127.0.0.1:3001";

if (
  !process.env.SIGNAL_RECYCLER_ALLOW_SHARED_SMOKE_DB &&
  !process.env.SIGNAL_RECYCLER_DB?.includes("smoke")
) {
  throw new Error(
    "Refusing to run smoke demo against a non-smoke database. Start the API with SIGNAL_RECYCLER_DB pointing at a temporary smoke database, or set SIGNAL_RECYCLER_ALLOW_SHARED_SMOKE_DB=1."
  );
}

async function request(path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  const response = await fetch(`${base}${path}`, {
    headers,
    ...options
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  return contentType.includes("application/json") ? response.json() : response.text();
}

const session = await request("/api/sessions", {
  method: "POST",
  body: JSON.stringify({ title: "CLI smoke demo" })
});

const firstRun = await request(`/api/sessions/${session.id}/run`, {
  method: "POST",
  body: JSON.stringify({
    prompt:
      "Teach memory: In fixtures/demo-repo, validate the project by trying `npm test` first. If that fails because of the package manager, explain the correction clearly so Signal Recycler can turn it into a durable rule."
  })
});

const firstRule = firstRun.candidateRules[0];
if (!firstRule) {
  throw new Error("Expected Phase 1 to create a rule candidate.");
}

await request(`/api/rules/${firstRule.id}/approve`, { method: "POST" });

const secondRun = await request(`/api/sessions/${session.id}/run`, {
  method: "POST",
  body: JSON.stringify({
    prompt:
      "Use memory: Start fresh and validate fixtures/demo-repo. Before running commands, follow any injected Signal Recycler Playbook rules and avoid repeating earlier failed approaches."
  })
});

const events = await request(`/api/sessions/${session.id}/events`);
const playbook = await request("/api/playbook/export");

console.log(
  JSON.stringify(
    {
      sessionId: session.id,
      approvedRule: firstRule.rule,
      phase2Response: secondRun.finalResponse,
      eventCategories: events.map((event) => event.category),
      proxyRequests: events.filter((event) => event.category === "proxy_request").length,
      playbook
    },
    null,
    2
  )
);
