import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Check,
  CircleAlert,
  FileDown,
  FolderOpen,
  Play,
  Recycle,
  Sparkles,
  X,
  Zap
} from "lucide-react";
import type { PlaybookRule, SessionRecord, TimelineEvent } from "@signal-recycler/shared";
import {
  type ApiConfig,
  approveRule,
  createSession,
  exportPlaybook,
  fetchConfig,
  listEvents,
  listRules,
  rejectRule,
  runSession
} from "./api";

function makeTeachPrompt(workdir: string): string {
  return `In the project at ${workdir}, run \`pnpm test\` and report the results. If any tests fail or produce errors, explain what failed clearly so Signal Recycler can distill a durable rule about this project's setup.`;
}

function makeUsePrompt(workdir: string): string {
  return `In the project at ${workdir}, run \`pnpm type-check\`. Before taking any action, check and follow all injected Signal Recycler Playbook rules from previous sessions.`;
}

export function App() {
  const [config, setConfig] = useState<ApiConfig | null>(null);
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [rules, setRules] = useState<PlaybookRule[]>([]);
  const [prompt, setPrompt] = useState("");
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

    async function init() {
      try {
        const cfg = await fetchConfig();
        if (cancelled) return;
        setConfig(cfg);
        setPrompt(makeTeachPrompt(cfg.workingDirectory));

        const created = await createSession();
        if (cancelled) return;
        setSession(created);
        await refresh(created.id);
      } catch (initError) {
        if (!cancelled) setError((initError as Error).message);
      }
    }

    void init();
    return () => { cancelled = true; };
  }, [refresh]);

  const metrics = useMemo(() => {
    const classifier = events.findLast((e) => e.category === "classifier_result");
    const meta = classifier?.metadata as
      | { signal?: string[]; noise?: string[]; failure?: string[] }
      | undefined;

    const signal =
      meta?.signal?.length ?? events.filter((e) => e.category === "codex_event").length;
    const noise = meta?.noise?.length ?? 0;
    const failure =
      meta?.failure?.length ?? rules.filter((r) => r.status === "pending").length;

    // Real compression tokens from proxy events
    const compressionTokens = events
      .filter((e) => e.category === "compression_result")
      .reduce((sum, e) => sum + (Number(e.metadata["tokensRemoved"]) || 0), 0);
    // Estimate tokens saved per approved rule (prevents repeated-mistake cost)
    const rulesTokens = rules.filter((r) => r.status === "approved").length * 300;

    return { signal, noise, failure, saved: compressionTokens + rulesTokens };
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
    if (action === "approve") await approveRule(id);
    else await rejectRule(id);
    await refresh(session.id);
  }

  async function handleExport() {
    setExported(await exportPlaybook());
  }

  const workdir = config?.workingDirectory ?? "…";
  const teachPrompt = config ? makeTeachPrompt(config.workingDirectory) : "";
  const usePrompt = config ? makeUsePrompt(config.workingDirectory) : "";

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
                  Codex proxy that compresses noisy history and injects approved project memory
                  into every turn.
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
              <h2 className="panel-title">Run Codex</h2>
              <p className="panel-copy">
                Teach memory with a real failure, approve the rule, then run a fresh turn. Signal
                Recycler compresses noise and injects the playbook automatically.
              </p>
            </div>

            <div className="rounded border border-[#d7d0c2] bg-white/70 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-[#66706c]">
                <FolderOpen size={14} />
                Working directory
              </div>
              <p className="break-all font-mono text-xs leading-5 text-[#263033]">
                {config ? workdir : <span className="text-[#999]">Loading…</span>}
              </p>
              {config && (
                <p className="mt-2 text-xs text-[#66706c]">
                  Set <code className="rounded bg-[#ece5d8] px-1">SIGNAL_RECYCLER_WORKDIR</code> to
                  point at any project.
                </p>
              )}
            </div>

            <textarea
              className="min-h-36 resize-none rounded border border-[#cfc6b5] bg-[#fffdf7] p-3 text-sm leading-6 outline-none focus:border-[#1d2528]"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <button
              className="primary-button"
              disabled={!session || running || !config}
              onClick={() => void handleRun()}
            >
              <Play size={17} />
              {running ? "Running Codex…" : "Run prompt"}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                className="secondary-button"
                disabled={running || !config}
                onClick={() => void handleRun(teachPrompt)}
              >
                Teach memory
              </button>
              <button
                className="secondary-button"
                disabled={running || !config}
                onClick={() => void handleRun(usePrompt)}
              >
                Use memory
              </button>
            </div>
            <button className="secondary-button justify-center" onClick={() => void handleExport()}>
              <FileDown size={16} />
              Export playbook
            </button>
            {error ? (
              <p className="rounded bg-[#ffe8de] p-3 text-sm text-[#8b2c13]">{error}</p>
            ) : null}
            {exported ? (
              <pre className="max-h-56 overflow-auto rounded bg-[#202726] p-3 text-xs text-[#e7f7dc]">
                {exported}
              </pre>
            ) : null}
          </aside>

          <section className="panel min-h-[660px]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="panel-title">Live context timeline</h2>
                <p className="panel-copy">
                  Compression events, proxy traffic, Codex turns, and distilled rules.
                </p>
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
                <p className="panel-copy">
                  Approve constraints to inject into future Codex turns.
                </p>
              </div>
              <Sparkles className="text-[#9db92d]" size={22} />
            </div>
            <RuleGroup
              title="Pending"
              rules={rules.filter((r) => r.status === "pending")}
              onAction={handleRuleAction}
            />
            <RuleGroup
              title="Approved"
              rules={rules.filter((r) => r.status === "approved")}
              onAction={handleRuleAction}
            />
            <RuleGroup
              title="Rejected"
              rules={rules.filter((r) => r.status === "rejected")}
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

const COMPRESSION_CHIP_CLASS =
  "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#fff3cd] text-[#7a5c00] border border-[#ffe08a]";

function TimelineRow({ event }: { event: TimelineEvent }) {
  const isCompression = event.category === "compression_result";
  return (
    <article className="timeline-row">
      <div className={`timeline-dot ${isCompression ? "bg-[#f59e0b]" : ""}`} />
      <div className="min-w-0">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          {isCompression ? (
            <span className={COMPRESSION_CHIP_CLASS}>
              <Zap size={10} />
              {event.category.replace("_", " ")}
            </span>
          ) : (
            <span className="event-chip">{event.category.replace("_", " ")}</span>
          )}
          <time className="text-xs text-[#747b76]">
            {new Date(event.createdAt).toLocaleTimeString()}
          </time>
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
          <p className="rounded border border-dashed border-[#d7d0c2] p-3 text-sm text-[#747b76]">
            No {title.toLowerCase()} rules.
          </p>
        ) : (
          rules.map((rule) => (
            <article key={rule.id} className="rounded border border-[#d7d0c2] bg-white/75 p-3">
              <div className="mb-2 flex items-start justify-between gap-3">
                <span className="event-chip">{rule.category}</span>
                {rule.status === "pending" ? (
                  <div className="flex gap-1">
                    <button
                      className="icon-button"
                      aria-label="Approve rule"
                      onClick={() => void onAction(rule.id, "approve")}
                    >
                      <Check size={15} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Reject rule"
                      onClick={() => void onAction(rule.id, "reject")}
                    >
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
          Run <strong>Teach memory</strong> to watch Signal Recycler compress noise, distill a
          failure into a rule, and inject the playbook into the next turn.
        </p>
      </div>
    </div>
  );
}
