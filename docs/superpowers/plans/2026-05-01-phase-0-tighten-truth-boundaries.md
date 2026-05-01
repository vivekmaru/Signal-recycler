# Phase 0 Tighten Truth And Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Signal Recycler's current v1 honest, testable, and easier to change before building Signal Recycler-owned sessions.

**Architecture:** Keep the current behavior intact while clarifying the product surface and splitting the API into smaller route/service modules. Add a minimal SQLite migration/version layer and indexes without changing the public store API. Keep the API-compatible proxy as the existing v1 adapter, not the forward product path.

**Tech Stack:** TypeScript, Fastify, React/Vite, SQLite via `node:sqlite`, Zod, Vitest, pnpm workspaces.

---

## File Structure

Create:

- `apps/api/src/routes/sessions.ts`: session creation/listing, session run endpoint, session events endpoint.
- `apps/api/src/routes/rules.ts`: rule list/create/approve/reject/export/reset endpoints.
- `apps/api/src/routes/demo.ts`: end-to-end demo endpoint and fixture lookup.
- `apps/api/src/routes/proxy.ts`: `/proxy/*` route and proxy request transformation/forwarding.
- `apps/api/src/services/turnProcessor.ts`: shared post-run classification, event creation, candidate rule creation, and high-confidence auto-approval.

Modify:

- `README.md`: replace hackathon-era proxy-first claims with current truth and Phase 0 product direction.
- `packages/shared/src/index.ts`: remove event categories that are not emitted.
- `apps/api/src/app.ts`: shrink to app setup plus route registration.
- `apps/api/src/store.ts`: add schema versioning, indexes, and robust project-scoped clearing.
- `apps/api/src/store.test.ts`: add migration/index tests to existing file.
- `apps/api/src/server.test.ts`: update event category expectations and route behavior coverage.
- `scripts/smoke-demo.mjs`: use isolated memory by default or require explicit opt-in to existing memory.
- `package.json`: keep existing script names unless adding a helper is necessary.

Do not modify in Phase 0:

- `apps/web/src/App.tsx`, except for compile breaks caused by event type cleanup.
- `apps/api/src/codexRunner.ts`, unless route extraction needs a type import change.
- Product implementation for owned sessions, headless CLI adapters, retrieval, context indexing, or cloud sync.

## Task 1: README Truth Pass

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Update the one-line description**

Replace the current description:

```markdown
**A Codex memory proxy that compresses noisy context and injects durable project rules into every future Codex turn.**
```

with:

```markdown
**A local-first memory runtime for coding agents, with an existing v1 OpenAI-compatible proxy for Codex traffic.**
```

- [ ] **Step 2: Replace the opening product framing**

Replace the two opening paragraphs after the description with:

```markdown
Signal Recycler is moving toward Signal Recycler-owned agent sessions: it stores the observable context around a run, retrieves relevant memory, injects scoped project guidance, streams/audits events, and learns durable memories after the run.

The current v1 implementation is narrower: it provides a local OpenAI-compatible proxy for Codex traffic, compresses selected noisy request items, records telemetry, extracts reusable playbook rules from dashboard runs, and injects approved rules into later proxied requests.
```

- [ ] **Step 3: Add a supported run modes section**

Add this section before `## Hackathon demo`:

```markdown
## Supported run modes

### Forward path: Signal Recycler-owned sessions

This is the product direction. Signal Recycler should own the session envelope around agent runs: retrieve memory, compress or omit low-value context, inject scoped memory, run an agent adapter, stream events to the dashboard, and learn asynchronously after the run.

This mode is not fully implemented yet. It is the next major direction after Phase 0 cleanup.

### Existing v1: API-compatible proxy adapter

The current app supports an OpenAI-compatible proxy at `/proxy/*`. The proxy can compress selected noisy request items, inject approved playbook rules, forward the transformed request upstream, and record request telemetry.

Proxy mode remains useful for API-compatible agents and custom apps, but it is the existing v1 adapter rather than the main forward roadmap.
```

- [ ] **Step 4: Update environment variable truth**

Change:

```markdown
| `OPENAI_API_KEY` | Yes | - | Project API key used by the proxy when forwarding requests to OpenAI. |
```

to:

```markdown
| `OPENAI_API_KEY` | Required for live proxy/dashboard Codex runs | - | Project API key used by the proxy when forwarding requests upstream and by the optional classifier. Mock mode can run without it. |
```

Change:

```markdown
| `SIGNAL_RECYCLER_CLASSIFIER_MODEL` | No | `gpt-5.4-mini` | Model used to classify turns and extract rule candidates. |
```

to:

```markdown
| `SIGNAL_RECYCLER_CLASSIFIER_MODEL` | No | `gpt-5.1-mini` | Model used by optional post-run classification. Heuristic fallback is used when no API key is available or classification fails. |
```

- [ ] **Step 5: Qualify broad claims**

Search for these phrases and update them:

```text
every future Codex turn
Project-aware operator
removes context noise
```

Use these replacement mappings:

```text
future requests routed through Signal Recycler
memory-aware when relevant approved memories are available
compresses selected noisy request items
```

- [ ] **Step 6: Run markdown-adjacent verification**

Run:

```bash
rg -n "every future|gpt-5.4-mini|Live State Graph|vector-store|dead-code|passive observation" README.md
```

Expected:

- No matches for `gpt-5.4-mini`, `Live State Graph`, `vector-store`, `dead-code`, or `passive observation`.
- If `every future` remains, it must refer only to future requests routed through Signal Recycler.

- [ ] **Step 7: Commit**

```bash
git add README.md
git commit -m "docs: align readme with phase 0 product direction"
```

## Task 2: Event Schema Cleanup

**Files:**

- Modify: `packages/shared/src/index.ts`
- Modify: `apps/api/src/server.test.ts`
- Modify if needed: `apps/web/src/App.tsx`

- [ ] **Step 1: Add schema guard expectation**

In `apps/api/src/server.test.ts`, add this test near the other proxy event tests:

```ts
it("uses only emitted event categories in proxy metadata tests", async () => {
  const categories = [
    "codex_event",
    "proxy_request",
    "compression_result",
    "classifier_result",
    "rule_candidate",
    "rule_auto_approved"
  ];

  expect(categories).not.toContain("proxy_injection");
  expect(categories).not.toContain("rule_approved");
  expect(categories).not.toContain("rule_rejected");
});
```

Run:

```bash
pnpm --filter @signal-recycler/api test
```

Expected:

- The test passes before implementation because it is only a guard list. The next step will make TypeScript fail if removed categories are still referenced.

- [ ] **Step 2: Remove unused event categories**

In `packages/shared/src/index.ts`, replace:

```ts
export const eventCategorySchema = z.enum([
  "codex_event",
  "proxy_request",
  "proxy_injection",
  "compression_result",
  "classifier_result",
  "rule_candidate",
  "rule_auto_approved",
  "rule_approved",
  "rule_rejected"
]);
```

with:

```ts
export const eventCategorySchema = z.enum([
  "codex_event",
  "proxy_request",
  "compression_result",
  "classifier_result",
  "rule_candidate",
  "rule_auto_approved"
]);
```

- [ ] **Step 3: Update tests that mention removed categories**

In `apps/api/src/server.test.ts`, replace assertions that reference `proxy_injection` with assertions against the current metadata-only behavior.

Keep this assertion:

```ts
expect(events.find((event) => event.category === "proxy_request")?.metadata).toMatchObject({
  injectedRules: 1
});
```

Remove or rewrite direct references to `"proxy_injection"`.

- [ ] **Step 4: Update smoke demo output**

In `scripts/smoke-demo.mjs`, replace:

```js
hasProxyInjection: events.some((event) => event.category === "proxy_injection"),
```

with:

```js
proxyRequests: events.filter((event) => event.category === "proxy_request").length,
```

- [ ] **Step 5: Verify**

Run:

```bash
pnpm type-check
pnpm test
```

Expected:

- Type-check passes.
- Tests pass.
- No `proxy_injection`, `rule_approved`, or `rule_rejected` references remain outside historical roadmap/docs.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/index.ts apps/api/src/server.test.ts scripts/smoke-demo.mjs
git commit -m "chore: remove unused event categories"
```

## Task 3: Store Schema Version And Indexes

**Files:**

- Modify: `apps/api/src/store.ts`
- Modify: `apps/api/src/store.test.ts`

- [ ] **Step 1: Add failing tests for indexes and schema version**

Append to `apps/api/src/store.test.ts`:

```ts
it("initializes schema metadata and query indexes", () => {
  const store = createStore(":memory:");
  const internals = store.inspectSchema();

  expect(internals.schemaVersion).toBe(1);
  expect(internals.indexes).toEqual(
    expect.arrayContaining([
      "idx_sessions_project_created",
      "idx_events_session_created",
      "idx_rules_project_status_created",
      "idx_rules_project_status_approved"
    ])
  );
});
```

Run:

```bash
pnpm --filter @signal-recycler/api test -- store.test.ts
```

Expected:

- Fail with `store.inspectSchema is not a function`.

- [ ] **Step 2: Add schema metadata and indexes**

In `apps/api/src/store.ts`, add this after the existing `CREATE TABLE` statements inside the `db.exec` call:

```sql
    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    INSERT OR IGNORE INTO schema_meta (key, value) VALUES ('schema_version', '1');

    CREATE INDEX IF NOT EXISTS idx_sessions_project_created
      ON sessions (project_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_events_session_created
      ON events (session_id, created_at ASC);

    CREATE INDEX IF NOT EXISTS idx_rules_project_status_created
      ON rules (project_id, status, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_rules_project_status_approved
      ON rules (project_id, status, approved_at ASC);
```

- [ ] **Step 3: Expose test-only schema inspection**

Add this method to the returned store object in `apps/api/src/store.ts`:

```ts
inspectSchema(): { schemaVersion: number; indexes: string[] } {
  const versionRow = db
    .prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'")
    .get() as { value?: string } | undefined;
  const indexes = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%' ORDER BY name ASC")
    .all()
    .map((row) => String((row as { name: unknown }).name));

  return {
    schemaVersion: Number(versionRow?.value ?? 0),
    indexes
  };
},
```

- [ ] **Step 4: Tighten clearProjectMemory project scoping**

In `clearProjectMemory`, remove the unconditional deletion of all `session_id = 'proxy'` events. Replace:

```ts
// Also delete the floating "proxy" bucket events (CLI traffic)
const proxyEvents = db.prepare("DELETE FROM events WHERE session_id = 'proxy'").run();
eventsDeleted += Number(proxyEvents.changes);
```

with:

```ts
const proxyEvents = db
  .prepare(
    "DELETE FROM events WHERE session_id = 'proxy' AND json_extract(metadata, '$.projectId') = ?"
  )
  .run(projectId);
eventsDeleted += Number(proxyEvents.changes);
```

Then ensure proxy events include `projectId` metadata in Task 5 when the proxy route is extracted.

- [ ] **Step 5: Verify**

Run:

```bash
pnpm --filter @signal-recycler/api test -- store.test.ts
pnpm type-check
```

Expected:

- Store tests pass.
- Type-check passes.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/store.ts apps/api/src/store.test.ts
git commit -m "feat: add sqlite schema metadata and indexes"
```

## Task 4: Extract Turn Processing Service

**Files:**

- Create: `apps/api/src/services/turnProcessor.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.test.ts`

- [ ] **Step 1: Create service file**

Create `apps/api/src/services/turnProcessor.ts`:

```ts
import { classifyTurn } from "../classifier.js";
import { type CodexRunner } from "../app.js";
import { type SignalRecyclerStore } from "../store.js";

export type ProcessTurnInput = {
  store: SignalRecyclerStore;
  codexRunner: CodexRunner;
  projectId: string;
  sessionId: string;
  prompt: string;
  workingDirectory?: string;
  classifyTitle?: string;
};

export async function processTurn(input: ProcessTurnInput): Promise<{
  finalResponse: string;
  items: unknown[];
  candidateRules: ReturnType<SignalRecyclerStore["listRules"]>;
}> {
  const turn = await input.codexRunner.run({
    sessionId: input.sessionId,
    prompt: input.prompt,
    ...(input.workingDirectory ? { workingDirectory: input.workingDirectory } : {})
  });

  const codexEvent = input.store.createEvent({
    sessionId: input.sessionId,
    category: "codex_event",
    title: "Codex response",
    body: turn.finalResponse,
    metadata: { items: turn.items.length }
  });

  const classification = await classifyTurn({
    prompt: input.prompt,
    finalResponse: turn.finalResponse,
    items: turn.items
  });

  input.store.createEvent({
    sessionId: input.sessionId,
    category: "classifier_result",
    title: input.classifyTitle ?? "Mark and distill complete",
    body: `${classification.signal.length} signal, ${classification.noise.length} noise, ${classification.failure.length} failure`,
    metadata: classification
  });

  const candidateRules = classification.candidateRules.map((candidate) => {
    let rule = input.store.createRuleCandidate({
      projectId: input.projectId,
      category: candidate.category,
      rule: candidate.rule,
      reason: candidate.reason,
      sourceEventId: codexEvent.id
    });

    input.store.createEvent({
      sessionId: input.sessionId,
      category: "rule_candidate",
      title: "Rule candidate created",
      body: candidate.rule,
      metadata: {
        ruleId: rule.id,
        reason: candidate.reason,
        category: candidate.category,
        confidence: candidate.confidence
      }
    });

    if (candidate.confidence === "high") {
      rule = input.store.approveRule(rule.id);
      input.store.createEvent({
        sessionId: input.sessionId,
        category: "rule_auto_approved",
        title: "Rule auto-approved",
        body: candidate.rule,
        metadata: {
          ruleId: rule.id,
          confidence: candidate.confidence,
          category: candidate.category
        }
      });
    }

    return rule;
  });

  return { finalResponse: turn.finalResponse, items: turn.items, candidateRules };
}
```

- [ ] **Step 2: Use service in `/api/sessions/:id/run`**

In `apps/api/src/app.ts`, import:

```ts
import { processTurn } from "./services/turnProcessor.js";
```

Replace the inline run/classification/candidate-rule block in `/api/sessions/:id/run` after the input event with:

```ts
try {
  return await processTurn({
    store: options.store,
    codexRunner: options.codexRunner,
    projectId,
    sessionId: id,
    prompt: parsed.prompt
  });
} catch (error) {
  const message = (error as Error).message;
  options.store.createEvent({
    sessionId: id,
    category: "codex_event",
    title: "Codex run failed",
    body: message,
    metadata: { phase: "codex_error" }
  });
  request.log.error({ err: error }, "Codex run failed");
  return reply.code(502).send({ error: "Codex run failed", message });
}
```

- [ ] **Step 3: Verify behavior preserved**

Run:

```bash
pnpm --filter @signal-recycler/api test -- server.test.ts
pnpm type-check
```

Expected:

- Existing run tests pass.
- Type-check may fail if `CodexRunner` creates a circular import problem. If it does, move `CodexRunner` type to `apps/api/src/types.ts`:

```ts
export type CodexRunner = {
  run(input: { sessionId: string; prompt: string; workingDirectory?: string }): Promise<{
    finalResponse: string;
    items: unknown[];
  }>;
};
```

Then update imports in `app.ts`, `codexRunner.ts`, and `services/turnProcessor.ts`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/app.ts apps/api/src/services/turnProcessor.ts apps/api/src/types.ts apps/api/src/server.test.ts
git commit -m "refactor: extract turn processing service"
```

If `apps/api/src/types.ts` was not created, omit it from `git add`.

## Task 5: Extract Route Modules

**Files:**

- Create: `apps/api/src/routes/sessions.ts`
- Create: `apps/api/src/routes/rules.ts`
- Create: `apps/api/src/routes/proxy.ts`
- Create: `apps/api/src/routes/demo.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.test.ts`

- [ ] **Step 1: Define route registration type**

In each route module, use this shared local shape:

```ts
import { type FastifyInstance } from "fastify";
import { type SignalRecyclerStore } from "../store.js";
import { type CodexRunner } from "../types.js";

export type RouteOptions = {
  store: SignalRecyclerStore;
  codexRunner: CodexRunner;
  projectId: string;
  workingDirectory: string;
  upstreamBaseUrl?: string;
};

export async function registerXRoutes(app: FastifyInstance, options: RouteOptions): Promise<void> {
  // moved routes go here
}
```

If `apps/api/src/types.ts` was not created in Task 4, create it now with the `CodexRunner` type shown in Task 4.

- [ ] **Step 2: Move session routes**

Create `apps/api/src/routes/sessions.ts`.

Move these routes from `app.ts` into `registerSessionRoutes`:

- `POST /api/sessions`
- `GET /api/sessions`
- `POST /api/sessions/:id/run`
- `GET /api/sessions/:id/events`

Keep behavior identical. Import `processTurn`, `path`, `createSessionRequestSchema`, and `runRequestSchema` as needed.

- [ ] **Step 3: Move rule routes**

Create `apps/api/src/routes/rules.ts`.

Move these routes from `app.ts` into `registerRuleRoutes`:

- `GET /api/rules`
- `POST /api/rules`
- `POST /api/rules/:id/approve`
- `POST /api/rules/:id/reject`
- `GET /api/playbook/export`
- `POST /api/memory/reset`

Keep behavior identical.

- [ ] **Step 4: Move proxy route**

Create `apps/api/src/routes/proxy.ts`.

Move:

- `app.all("/proxy/*", ...)`
- `sizeOf`
- `countInputItems`
- `buildProxyRequestSummary`
- `injectProxyBody`
- `shouldDropRequestHeader`
- `shouldDropResponseHeader`
- `REQUEST_HEADERS_TO_DROP_UPSTREAM`

Add `projectId` to proxy event metadata:

```ts
metadata: {
  projectId: options.projectId,
  method: request.method,
  path: tail,
  originalSize,
  finalSize,
  originalItems,
  finalItems,
  compressions,
  charsRemoved,
  tokensRemoved,
  injectedRules: rules.length,
  ruleIds: rules.map((r) => r.id)
}
```

- [ ] **Step 5: Move demo route**

Create `apps/api/src/routes/demo.ts`.

Move:

- `POST /api/demo/run`
- `findFixtureDir`

For Phase 0, preserve the current demo behavior. The isolated smoke script is handled in Task 6.

- [ ] **Step 6: Shrink app.ts to setup and registration**

In `apps/api/src/app.ts`, keep:

- imports for Fastify, cors, route registration functions
- `CodexRunner` type import or re-export if needed
- `AppOptions`
- `createApp`
- content type parser
- CORS registration
- proxy header cleanup hook
- `/health`
- `/api/config`
- route registration calls

The body of `createApp` should end with:

```ts
  app.get("/health", async () => ({ ok: true }));

  app.get("/api/config", async () => ({
    projectId,
    workingDirectory,
    workingDirectoryBasename: path.basename(workingDirectory)
  }));

  await registerSessionRoutes(app, options);
  await registerDemoRoutes(app, options);
  await registerRuleRoutes(app, options);
  await registerProxyRoutes(app, options);

  return app;
}
```

- [ ] **Step 7: Verify after each route move**

After moving each route module, run:

```bash
pnpm --filter @signal-recycler/api test -- server.test.ts
pnpm type-check
```

Expected:

- Tests pass after every route extraction.
- Type-check passes.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/app.ts apps/api/src/routes apps/api/src/types.ts apps/api/src/server.test.ts
git commit -m "refactor: split api routes by responsibility"
```

If `apps/api/src/types.ts` already existed from Task 4, it will already be tracked; include it if modified.

## Task 6: Isolate Smoke Demo Memory

**Files:**

- Modify: `scripts/smoke-demo.mjs`
- Modify: `package.json` only if adding a new script is necessary.

- [ ] **Step 1: Make smoke script reject accidental shared DB usage**

At the top of `scripts/smoke-demo.mjs`, add:

```js
if (!process.env.SIGNAL_RECYCLER_ALLOW_SHARED_SMOKE_DB && !process.env.SIGNAL_RECYCLER_DB?.includes("smoke")) {
  throw new Error(
    "Refusing to run smoke demo against a non-smoke database. Start the API with SIGNAL_RECYCLER_DB pointing at a temporary smoke database, or set SIGNAL_RECYCLER_ALLOW_SHARED_SMOKE_DB=1."
  );
}
```

This makes contamination explicit. It does not try to restart the API because the script currently talks to an already-running server.

- [ ] **Step 2: Add instructions to README verification section**

In `README.md`, update the verification section to include:

```bash
SIGNAL_RECYCLER_MOCK_CODEX=1 SIGNAL_RECYCLER_DB=/tmp/signal-recycler-smoke.sqlite pnpm dev
pnpm smoke:demo
```

Add one sentence:

```markdown
`pnpm smoke:demo` expects the API to be running against a smoke/test database unless `SIGNAL_RECYCLER_ALLOW_SHARED_SMOKE_DB=1` is set explicitly.
```

- [ ] **Step 3: Verify explicit failure path**

Run while the API is not relevant:

```bash
pnpm smoke:demo
```

Expected:

- Fails with `Refusing to run smoke demo against a non-smoke database` unless `SIGNAL_RECYCLER_DB` includes `smoke` or `SIGNAL_RECYCLER_ALLOW_SHARED_SMOKE_DB=1`.

- [ ] **Step 4: Verify script can still run with opt-in**

If a dev server is already running:

```bash
SIGNAL_RECYCLER_ALLOW_SHARED_SMOKE_DB=1 pnpm smoke:demo
```

Expected:

- It behaves as before.

If no dev server is running, skip this step and note that live smoke verification was not run.

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-demo.mjs README.md package.json
git commit -m "test: guard smoke demo against shared memory"
```

If `package.json` was not modified, omit it from `git add`.

## Task 7: Final Verification And Roadmap Sync

**Files:**

- Modify: `docs/validation-roadmap.md` only if Phase 0 scope changed while implementing.

- [ ] **Step 1: Run full verification**

Run:

```bash
pnpm test
pnpm type-check
pnpm build
```

Expected:

- All commands pass.

- [ ] **Step 2: Check README claim drift**

Run:

```bash
rg -n "gpt-5.4-mini|every future Codex|proxy_injection|rule_approved|rule_rejected|passive observation" README.md apps packages scripts
```

Expected:

- No matches except any intentionally documented historical note in `docs/validation-roadmap.md`, which is outside this command.

- [ ] **Step 3: Check app.ts size and responsibilities**

Run:

```bash
wc -l apps/api/src/app.ts apps/api/src/routes/*.ts apps/api/src/services/*.ts
```

Expected:

- `apps/api/src/app.ts` is substantially smaller than before.
- Route files own endpoint behavior.
- `turnProcessor.ts` owns post-run classification and rule candidate creation.

- [ ] **Step 4: Commit roadmap plan if not already committed**

```bash
git add docs/validation-roadmap.md docs/superpowers/plans/2026-05-01-phase-0-tighten-truth-boundaries.md
git commit -m "docs: add phase 0 implementation plan"
```

- [ ] **Step 5: Final branch status**

Run:

```bash
git status --short
git log --oneline --max-count=8
```

Expected:

- Worktree is clean.
- Recent commits show the Phase 0 plan and implementation commits.

## Self-Review

Spec coverage:

- README truth and product direction: Task 1.
- API boundary cleanup: Tasks 4 and 5.
- SQLite indexes and schema version: Task 3.
- Event schema drift: Task 2.
- Isolated smoke demo: Task 6.
- Final verification: Task 7.

Known intentional deferrals:

- Signal Recycler-owned sessions implementation.
- Codex headless adapter.
- Claude Code adapter.
- Context indexing.
- Retrieval ranking.
- Async classifier queue.
- Cloud sync.

Placeholder scan:

- No `TBD` or open-ended implementation instructions are intentionally left.
- Route extraction steps refer to exact route names and files, but require moving existing code rather than rewriting every line inline. That is deliberate to preserve behavior and reduce transcription risk.

Type consistency:

- `CodexRunner` should move to `apps/api/src/types.ts` if `turnProcessor.ts` creates an import cycle with `app.ts`.
- `RouteOptions` should use the same `CodexRunner` type from `apps/api/src/types.ts`.
- `SignalRecyclerStore` remains the store boundary during Phase 0.
