import path from "node:path";
import { fileURLToPath } from "node:url";
import { Codex } from "@openai/codex-sdk";
import { injectPlaybookRules } from "./playbook.js";
import { type SignalRecyclerStore } from "./store.js";
import { type CodexRunner } from "./app.js";

type ThreadLike = {
  run(prompt: string): Promise<{ finalResponse?: string; items?: unknown[] }>;
};

export function createCodexRunner(input: {
  store: SignalRecyclerStore;
  apiPort: number;
}): CodexRunner {
  const threads = new Map<string, ThreadLike>();
  const codex = new Codex({
    baseUrl: `http://127.0.0.1:${input.apiPort}/proxy/v1`,
    apiKey: process.env.OPENAI_API_KEY,
    env: stringEnv(process.env)
  });

  return {
    async run({ sessionId, prompt }) {
      const rules = input.store.listApprovedRules("demo-repo");
      input.store.createEvent({
        sessionId,
        category: "proxy_request",
        title: "Codex SDK routed through proxy",
        body: "The dashboard run is sent through Signal Recycler before Codex sees it.",
        metadata: { approvedRulesAvailable: rules.length }
      });
      if (rules.length > 0) {
        input.store.createEvent({
          sessionId,
          category: "proxy_injection",
          title: "Approved playbook rules injected",
          body: `${rules.length} durable rule(s) prepended to the Codex turn.`,
          metadata: { ruleIds: rules.map((rule) => rule.id) }
        });
      }

      if (process.env.SIGNAL_RECYCLER_MOCK_CODEX === "1") {
        const injected = injectPlaybookRules(prompt, rules);
        return {
          finalResponse:
            rules.length > 0
              ? `Checking learned constraints... ${rules[0]?.rule} I will avoid the previous npm path.`
              : "I tried npm install and it failed. The user corrected me to use pnpm test instead.",
          items: [{ type: "mock", injected }]
        };
      }

      let thread = threads.get(sessionId);
      if (!thread) {
        thread = codex.startThread({
          workingDirectory: fixtureRepoPath(),
          skipGitRepoCheck: true
        }) as ThreadLike;
        threads.set(sessionId, thread);
      }

      const turn = await thread.run(prompt);
      return {
        finalResponse: turn.finalResponse ?? "",
        items: turn.items ?? []
      };
    }
  };
}

function fixtureRepoPath(): string {
  const current = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(current, "../../../fixtures/demo-repo");
}

function stringEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}
