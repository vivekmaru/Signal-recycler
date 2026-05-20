# Eval Report Endpoint Follow-Up Backlog

## P0

- None.

## P1

- Add historical eval report browsing.
  - Residual risk: `latest.json` is enough for current dashboard visibility, but reviewers cannot compare current output against prior runs.
  - Next action: define a report run ID and retention contract before adding UI history.

## P2

- Add dashboard-triggered eval execution.
  - Residual risk: users may expect the disabled `Run all` button to become active.
  - Next action: design a safe local-only job trigger with progress and cancellation before enabling the button.
- Add raw case detail inspection.
  - Residual risk: the endpoint intentionally strips `details`, so deeper selected-path debugging still requires opening `latest.json`.
  - Next action: add a separate read-only case detail route if reviewers need selected/gold path inspection in the UI.
- Add mobile-specific visual QA for the Evals page.
  - Residual risk: this pass verified desktop layout through the in-app browser; narrow viewport behavior was not separately exercised.
  - Next action: add a responsive browser check once the dashboard shell has an established mobile validation path.

## Residual Risk

- Duplicate aggregate metric names are valid report data and now render with stable indexed keys, but future charts should treat metric identity as `(suite/run position, name, unit)` rather than assuming global uniqueness.
