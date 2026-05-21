# Eval Report Endpoint Review Guide

## Scope Summary

Adds a stable read-only eval report endpoint and connects the Evals dashboard view to the latest local eval report output, with Context Index results shown first when present.

## Subsystem Change Map

- `packages/shared/src/index.ts`
  - Adds eval report schemas and shared TypeScript types for report status, metrics, suites, cases, and dashboard summaries.
- `apps/api/src/routes/evals.ts`
  - Adds `GET /api/evals/report`.
  - Reads `.signal-recycler/evals/latest.json`.
  - Returns an honest empty state when no report exists.
  - Validates report JSON before summarizing it.
  - Strips per-case `details` from the dashboard summary contract.
- `apps/api/src/app.ts` and `apps/api/src/server.ts`
  - Registers eval routes.
  - Supports `evalReportDir` injection for tests and `SIGNAL_RECYCLER_EVAL_REPORT_DIR` for local overrides.
- `apps/web/src/api.ts`
  - Adds `fetchEvalReport()`.
- `apps/web/src/lib/evalPresenters.ts`
  - Builds report metrics, suite rows, status tones, and Context Index-first suite selection.
- `apps/web/src/views/EvalsView.tsx`
  - Replaces the preview-only placeholder with real report loading, empty state, refresh, status badges, Context Index cases, aggregate metrics, and suite summaries.
  - Keeps `Run all` disabled because dashboard-triggered eval execution is not implemented.
- Tests
  - Adds API coverage in `apps/api/src/server.test.ts`.
  - Adds web presenter coverage in `apps/web/src/lib/evalPresenters.test.ts`.

## Reviewer Focus Areas

- Confirm `/api/evals/report` is read-only and does not run evals as a side effect.
- Confirm the dashboard only displays report-backed fields.
- Confirm Context Index results are prioritized without hiding other suites.
- Confirm missing local report output produces an honest empty state rather than fake metrics.

## Known Non-Blockers And Expected Warnings

- The dashboard still cannot run evals. The button remains disabled and labeled as unimplemented via title text.
- The endpoint summarizes `latest.json`; it does not expose markdown contents or historical report runs.
- Browser console logs can retain warnings from previous page loads. A fresh-tab timestamp filter showed no new warnings after the duplicate metric key fix.

## Verification Commands And Results

- `pnpm --filter @signal-recycler/api test -- src/server.test.ts` - passed.
- `pnpm --filter @signal-recycler/web test -- src/lib/evalPresenters.test.ts` - passed.
- `pnpm type-check` - passed.
- `pnpm eval` - passed; generated `.signal-recycler/evals/latest.json` with `Context Index Retrieval`.
- `pnpm test` - passed.
- `pnpm build` - passed.
- `curl -s http://127.0.0.1:3001/api/evals/report | jq ...` - passed; endpoint returned `available=true`, `status=pass`, `mode=local`, Context Index `cases=4`, and Context Index `metrics=5`.
- Browser QA on `http://127.0.0.1:5173/evals` - passed; page rendered Context Index cases, disabled `Run all`, working `Refresh`, and no fresh console warnings or errors.

## Explicit Out Of Scope

- Running evals from the dashboard.
- Eval report history, comparisons, or trend charts.
- Live eval execution controls.
- Displaying raw case `details` payloads.
