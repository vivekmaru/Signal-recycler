# Low-Signal Memory Retrieval Follow-Up Backlog

## Follow-Ups

- Add a retrieval quality eval for low-information prompts:
  - `test`
  - `run tests`
  - `check this`
  - `validate repo`
- Add a positive eval proving specific testing prompts still retrieve useful memory:
  - `run pnpm validation`
  - `package manager validation`
  - `api test command`
- Consider exposing query terms in retrieval debug metadata so the dashboard can show why a prompt selected zero memories.
- Consider a second-stage deterministic quality gate before vector or LLM reranking:
  - minimum meaningful term count
  - category/scope overlap
  - project/package/file scope match
- Revisit whether adapter errors should still show context-envelope events when no memory is injected, so failures are easier to distinguish from retrieval behavior.
