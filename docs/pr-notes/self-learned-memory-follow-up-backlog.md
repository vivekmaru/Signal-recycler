# Self-Learned Memory Fix Follow-Up Backlog

## P1: Show Suppressed Candidates In Audit Metadata

Residual risk: reviewers can see the classifier's raw candidate in `classifier_result`, but there is no explicit event or structured field saying it was intentionally suppressed because approved memory already covered it.

Next action: add a `suppressedCandidates` field to the turn processor result or classifier audit metadata with candidate text, matched memory ID, and suppression reason.

## P1: Expand Deterministic Duplicate Detection Fixtures

Residual risk: the current regression covers the pnpm/npm family found in smoke testing, but not multiple equivalent phrasings.

Next action: add table-driven tests for equivalent command convention wording, exact duplicates with punctuation differences, and unrelated candidates that must still be created.

## P2: Consider Memory Update Instead Of Suppression

Residual risk: a broader candidate may sometimes be a legitimate refinement of a narrower approved memory.

Next action: design a supersede/update flow where a broader high-confidence candidate becomes a pending replacement instead of being silently suppressed.
