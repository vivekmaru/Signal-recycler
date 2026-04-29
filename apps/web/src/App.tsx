import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Check,
  CircleAlert,
  FileDown,
  GitBranch,
  Play,
  Recycle,
  Sparkles,
  X
} from "lucide-react";
import type { PlaybookRule, SessionRecord, TimelineEvent } from "@signal-recycler/shared";
import {
  approveRule,
  createSession,
  exportPlaybook,
  listEvents,
  listRules,
  rejectRule,
  runSession
} from "./api";

const teachMemoryPrompt =
  "Teach memory: In fixtures/demo-repo, validate the project by trying `npm test` first. If that fails because of the package manager, explain the correction clearly so Signal Recycler can turn it into a durable rule.";
const useMemoryPrompt =
  "Use memory: Start fresh and validate fixtures/demo-repo. Before running commands, follow any injected Signal Recycler Playbook rules and avoid repeating earlier failed approaches.";

export function App() {
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [rules, setRules] = useState<PlaybookRule[]>([]);
  const [prompt, setPrompt] = useState(teachMemoryPrompt);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exported, setExported] = useState<string>("");

  const refresh = useCallback(async (sessionId?: string | null) => {
    const [nextRules, nextEvents] = await Promise.all([
      listRules(),
      sessionId ? listEvents(sessionId) : Promise.resolve([])
    ]);
    setRules(nextRules);
    setEvents(nextEvents);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initializeSession() {
      try {
        const created = await createSession("Judge demo");
        if (cancelled) return;
        setSession(created);
        await refresh(created.id);
      } catch (initError) {
        if (!cancelled) setError((initError as Error).message);
      }
    }

    void initializeSession();

    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const metrics = useMemo(() => {
    const classifier = events.findLast((event) => event.category === "classifier_result");
    const metadata = classifier?.metadata as
      | { signal?: string[]; noise?: string[]; failure?: string[] }
      | undefined;
    const signal = metadata?.signal?.length ?? events.filter((event) => event.category === "codex_event").length;
    const noise = metadata?.noise?.length ?? 0;
    const failure = metadata?.failure?.length ?? rules.filter((rule) => rule.status === "pending").length;
    return {
      signal,
      noise,
      failure,
      saved: Math.max(0, noise * 420 + rules.filter((rule) => rule.status === "approved").length * 900)
    };
  }, [events, rules]);

  async function handleRun(nextPrompt = prompt) {
    if (!session) return;
    setRunning(true);
    setError(null);
    setPrompt(nextPrompt);
    try {
      await runSession(session.id, nextPrompt);
      await refresh(session.id);
    } catch (runError) {
      setError((runError as Error).message);
    } finally {
      setRunning(false);
    }
  }

  async function handleRuleAction(id: string, action: "approve" | "reject") {
    if (!session) return;
    if (action === "approve") {
      await approveRule(id);
    } else {
      await rejectRule(id);
    }
    await refresh(session.id);
  }

  async function handleExport() {
    setExported(await exportPlaybook());
  }

  return (
    <main className="min-h-screen bg-[#f6f3ec] text-[#1d2528]">
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col gap-5 px-5 py-5">
        <header className="flex flex-col gap-4 border-b border-[#d7d0c2] pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded bg-[#1d2528] text-[#d9ff65]">
                <Recycle size={24} />
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-normal">Signal Recycler</h1>
                <p className="max-w-2xl text-sm text-[#5f6868]">
                  Codex SDK proxy that turns failed agent work into approved project memory.
                </p>
              </div>
            </div>
          </div>
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="Signal" value={metrics.signal} tone="emerald" />
            <Metric label="Noise" value={metrics.noise} tone="stone" />
            <Metric label="Failure" value={metrics.failure} tone="rose" />
            <Metric label="Tokens saved" value={metrics.saved} tone="lime" />
          </section>
        </header>

        <section className="grid flex-1 gap-5 lg:grid-cols-[330px_minmax(0,1fr)_390px]">
          <aside className="panel flex flex-col gap-4">
            <div>
              <h2 className="panel-title">Demo control</h2>
              <p className="panel-copy">
                Teach memory with a real Codex failure, approve the rule, then run a fresh turn that receives the approved playbook.
              </p>
            </div>
            <div className="rounded border border-[#d7d0c2] bg-white/70 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-[#66706c]">
                <GitBranch size={14} />
                fixtures/demo-repo
              </div>
              <p className="text-sm leading-6 text-[#263033]">
                Project convention: package scripts must use pnpm. Teach memory asks Codex to try npm first; Use memory should avoid that repeated mistake.
              </p>
            </div>
            <textarea
              className="min-h-36 resize-none rounded border border-[#cfc6b5] bg-[#fffdf7] p-3 text-sm leading-6 outline-none focus:border-[#1d2528]"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
            <button className="primary-button" disabled={!session || running} onClick={() => void handleRun()}>
              <Play size={17} />
              {running ? "Running Codex" : "Run prompt"}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button className="secondary-button" disabled={running} onClick={() => void handleRun(teachMemoryPrompt)}>
                Teach memory
              </button>
              <button className="secondary-button" disabled={running} onClick={() => void handleRun(useMemoryPrompt)}>
                Use memory
              </button>
            </div>
            <button className="secondary-button justify-center" onClick={() => void handleExport()}>
              <FileDown size={16} />
              Export playbook
            </button>
            {error ? <p className="rounded bg-[#ffe8de] p-3 text-sm text-[#8b2c13]">{error}</p> : null}
            {exported ? <pre className="max-h-56 overflow-auto rounded bg-[#202726] p-3 text-xs text-[#e7f7dc]">{exported}</pre> : null}
          </aside>

          <section className="panel min-h-[660px]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="panel-title">Live context timeline</h2>
                <p className="panel-copy">Proxy events, Codex turns, classifier output, and rule creation.</p>
              </div>
              <Activity className="text-[#627067]" size={22} />
            </div>
            <div className="timeline">
              {events.length === 0 ? (
                <EmptyState />
              ) : (
                events.map((event) => <TimelineRow key={event.id} event={event} />)
              )}
            </div>
          </section>

          <aside className="panel flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="panel-title">Active playbook</h2>
                <p className="panel-copy">Approve only constraints you want injected into future Codex turns.</p>
              </div>
              <Sparkles className="text-[#9db92d]" size={22} />
            </div>
            <RuleGroup
              title="Pending"
              rules={rules.filter((rule) => rule.status === "pending")}
              onAction={handleRuleAction}
            />
            <RuleGroup
              title="Approved"
              rules={rules.filter((rule) => rule.status === "approved")}
              onAction={handleRuleAction}
            />
            <RuleGroup
              title="Rejected"
              rules={rules.filter((rule) => rule.status === "rejected")}
              onAction={handleRuleAction}
            />
          </aside>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: string }) {
  const toneClass =
    tone === "emerald"
      ? "bg-[#dff5df]"
      : tone === "rose"
        ? "bg-[#ffe0d9]"
        : tone === "lime"
          ? "bg-[#e9f9a8]"
          : "bg-[#ece5d8]";
  return (
    <div className={`${toneClass} min-w-32 rounded border border-black/10 px-4 py-3`}>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs font-medium uppercase text-[#5f6868]">{label}</div>
    </div>
  );
}

function TimelineRow({ event }: { event: TimelineEvent }) {
  return (
    <article className="timeline-row">
      <div className="timeline-dot" />
      <div className="min-w-0">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="event-chip">{event.category.replace("_", " ")}</span>
          <time className="text-xs text-[#747b76]">{new Date(event.createdAt).toLocaleTimeString()}</time>
        </div>
        <h3 className="text-sm font-semibold">{event.title}</h3>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#4f5a59]">{event.body}</p>
      </div>
    </article>
  );
}

function RuleGroup({
  title,
  rules,
  onAction
}: {
  title: string;
  rules: PlaybookRule[];
  onAction: (id: string, action: "approve" | "reject") => Promise<void>;
}) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase text-[#66706c]">{title}</h3>
      <div className="flex flex-col gap-2">
        {rules.length === 0 ? (
          <p className="rounded border border-dashed border-[#d7d0c2] p-3 text-sm text-[#747b76]">No {title.toLowerCase()} rules.</p>
        ) : (
          rules.map((rule) => (
            <article key={rule.id} className="rounded border border-[#d7d0c2] bg-white/75 p-3">
              <div className="mb-2 flex items-start justify-between gap-3">
                <span className="event-chip">{rule.category}</span>
                {rule.status === "pending" ? (
                  <div className="flex gap-1">
                    <button className="icon-button" aria-label="Approve rule" onClick={() => void onAction(rule.id, "approve")}>
                      <Check size={15} />
                    </button>
                    <button className="icon-button" aria-label="Reject rule" onClick={() => void onAction(rule.id, "reject")}>
                      <X size={15} />
                    </button>
                  </div>
                ) : null}
              </div>
              <p className="text-sm font-medium leading-6">{rule.rule}</p>
              <p className="mt-2 text-xs leading-5 text-[#69716e]">{rule.reason}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="grid h-[520px] place-items-center rounded border border-dashed border-[#d7d0c2] bg-white/45 text-center">
      <div className="max-w-sm px-6">
        <CircleAlert className="mx-auto mb-3 text-[#8b918b]" />
        <h3 className="font-semibold">No Codex traffic yet</h3>
        <p className="mt-2 text-sm leading-6 text-[#66706c]">
          Run Teach memory to watch Signal Recycler mark a failure, distill a rule, and prepare memory for a fresh Codex turn.
        </p>
      </div>
    </div>
  );
}
