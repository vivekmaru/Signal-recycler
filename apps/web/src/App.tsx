import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Check,
  FileDown,
  FolderOpen,
  Play,
  Recycle,
  RefreshCw,
  Sparkles,
  Terminal,
  Trash2,
  X,
  Zap
} from "lucide-react";
import type { PlaybookRule, SessionRecord, TimelineEvent } from "@signal-recycler/shared";
import {
  type ApiConfig,
  type DemoRunResult,
  approveRule,
  createManualRule,
  createSession,
  exportPlaybook,
  fetchConfig,
  listFirehose,
  listRules,
  rejectRule,
  resetMemory,
  runDemo,
  runSession
} from "./api";

const POLL_INTERVAL_MS = 1500;

export function App() {
  const [config, setConfig] = useState<ApiConfig | null>(null);
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [rules, setRules] = useState<PlaybookRule[]>([]);
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [demoRunning, setDemoRunning] = useState(false);
  const [demoStage, setDemoStage] = useState<"idle" | "phase1" | "approving" | "phase2" | "done">(
    "idle"
  );
  const [demoResult, setDemoResult] = useState<DemoRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exported, setExported] = useState<string>("");
  const [manualRuleOpen, setManualRuleOpen] = useState(false);
  const [manualRuleForm, setManualRuleForm] = useState({
    category: "guardrail",
    rule: "",
    reason: ""
  });
  const lastEventCountRef = useRef(0);

  const refresh = useCallback(async () => {
    const [nextRules, nextEvents] = await Promise.all([listRules(), listFirehose(200)]);
    setRules(nextRules);
    setEvents(nextEvents);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function init() {
      try {
        const cfg = await fetchConfig();
        if (cancelled) return;
        setConfig(cfg);

        const created = await createSession();
        if (cancelled) return;
        setSession(created);
        await refresh();

        interval = setInterval(() => {
          if (!cancelled) void refresh();
        }, POLL_INTERVAL_MS);
      } catch (initError) {
        if (!cancelled) setError((initError as Error).message);
      }
    }

    void init();
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [refresh]);

  const liveStatus = useMemo(() => {
    const hadNew = events.length > lastEventCountRef.current;
    lastEventCountRef.current = events.length;
    if (events.length === 0) return "idle";
    return hadNew ? "live" : "connected";
  }, [events.length]);

  const metrics = useMemo(() => {
    const proxyEvents = events.filter((e) => e.category === "proxy_request");
    const compressionEvents = events.filter((e) => e.category === "compression_result");
    const totalTokensSaved = compressionEvents.reduce(
      (sum, e) => sum + (Number(e.metadata["tokensRemoved"]) || 0),
      0
    );
    const totalCompressions = compressionEvents.reduce(
      (sum, e) => sum + (Number(e.metadata["compressions"]) || 0),
      0
    );

    return {
      requests: proxyEvents.length,
      compressions: totalCompressions,
      pendingRules: rules.filter((r) => r.status === "pending").length,
      approvedRules: rules.filter((r) => r.status === "approved").length,
      tokensSaved: totalTokensSaved
    };
  }, [events, rules]);

  async function handleRun(nextPrompt = prompt) {
    if (!session || !nextPrompt.trim()) return;
    setRunning(true);
    setError(null);
    setPrompt(nextPrompt);
    try {
      await runSession(session.id, nextPrompt);
      await refresh();
    } catch (runError) {
      setError((runError as Error).message);
    } finally {
      setRunning(false);
    }
  }

  async function handleRunDemo() {
    if (demoRunning) return;
    setDemoRunning(true);
    setError(null);
    setDemoResult(null);
    setDemoStage("phase1");
    try {
      // Reset first so the demo always starts from a known empty-memory state
      await resetMemory();
      await refresh();
      // The orchestrator runs both phases server-side; we surface stage hints
      // via timing but the real source of truth is the timeline.
      setTimeout(() => setDemoStage("approving"), 4000);
      setTimeout(() => setDemoStage("phase2"), 7000);
      const result = await runDemo();
      setDemoResult(result);
      setDemoStage("done");
      await refresh();
    } catch (demoError) {
      setError((demoError as Error).message);
      setDemoStage("idle");
    } finally {
      setDemoRunning(false);
    }
  }

  async function handleResetMemory() {
    if (!window.confirm("Reset all memories, sessions, and events for this project?")) return;
    await resetMemory();
    setDemoResult(null);
    setDemoStage("idle");
    await refresh();
  }

  async function handleRuleAction(id: string, action: "approve" | "reject") {
    if (action === "approve") await approveRule(id);
    else await rejectRule(id);
    await refresh();
  }

  async function handleCreateManualRule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await createManualRule({
        category: manualRuleForm.category.trim(),
        rule: manualRuleForm.rule.trim(),
        reason: manualRuleForm.reason.trim()
      });
      setManualRuleForm({ category: "guardrail", rule: "", reason: "" });
      setManualRuleOpen(false);
      await refresh();
    } catch (manualRuleError) {
      setError((manualRuleError as Error).message);
    }
  }

  async function handleExport() {
    setExported(await exportPlaybook());
  }

  const workdir = config?.workingDirectory ?? "…";

  return (
    <main className="min-h-screen bg-[#f6f3ec] text-[#1d2528]">
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col gap-5 px-5 py-5">
        <header className="flex flex-col gap-4 border-b border-[#d7d0c2] pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded bg-[#1d2528] text-[#d9ff65]">
              <Recycle size={24} />
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-normal">Signal Recycler</h1>
              <p className="max-w-2xl text-sm text-[#5f6868]">
                Codex proxy that compresses noise and turns failures into approved memory — every
                turn auto-extracts memory candidates, high-confidence ones auto-approve.
              </p>
            </div>
          </div>
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="Requests" value={metrics.requests} tone="emerald" />
            <Metric label="Compressed" value={metrics.compressions} tone="amber" />
            <Metric label="Approved memory" value={metrics.approvedRules} tone="lime" />
            <Metric label="Tokens saved" value={metrics.tokensSaved} tone="lime" highlight />
          </section>
        </header>

        <section className="grid flex-1 gap-5 lg:grid-cols-[330px_minmax(0,1fr)_390px]">
          <aside className="panel flex flex-col gap-4">
            <div>
              <h2 className="panel-title">Codex traffic</h2>
              <p className="panel-copy">
                Send a prompt from here, or pipe your terminal{" "}
                <code className="rounded bg-[#ece5d8] px-1">codex</code> CLI through the proxy.
                Either way, every turn auto-classifies and high-confidence memories auto-approve.
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
            </div>

            <textarea
              className="min-h-32 resize-none rounded border border-[#cfc6b5] bg-[#fffdf7] p-3 text-sm leading-6 outline-none focus:border-[#1d2528]"
              placeholder="Type any prompt — e.g. 'run the test suite and report what failed'"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <button
              className="primary-button"
              disabled={!session || running || !prompt.trim()}
              onClick={() => void handleRun()}
            >
              <Play size={17} />
              {running ? "Running Codex…" : "Run prompt"}
            </button>

            <div className="rounded border border-dashed border-[#9db92d] bg-[#f4fbe1] p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-[#5d7517]">
                <Sparkles size={14} />
                Run end-to-end demo
              </div>
              <p className="text-xs leading-5 text-[#263033]">
                Resets memory, then runs two prompts back-to-back: one that triggers a known
                failure, then the same task after the memory is auto-approved. Compares both runs.
              </p>
              <button
                className="mt-3 w-full rounded bg-[#1d2528] px-3 py-2 text-sm font-semibold text-[#d9ff65] disabled:opacity-50"
                disabled={demoRunning}
                onClick={() => void handleRunDemo()}
              >
                {demoRunning ? `Running demo… (${demoStage})` : "Run learn → use demo"}
              </button>
            </div>

            <div className="rounded border border-dashed border-[#cfc6b5] bg-white/50 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-[#66706c]">
                <Terminal size={14} />
                Use from your terminal
              </div>
              <p className="text-xs leading-5 text-[#263033]">
                Run <code>pnpm codex:install</code> once, then any codex command flows through:
              </p>
              <pre className="mt-1 overflow-x-auto rounded bg-[#202726] p-2 text-[11px] leading-5 text-[#e7f7dc]">
                {`codex -c model_provider='"signal_recycler"' \\\n  "your prompt..."`}
              </pre>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button className="secondary-button justify-center" onClick={() => void handleExport()}>
                <FileDown size={16} />
                Export
              </button>
              <button
                className="secondary-button justify-center text-[#8b2c13]"
                onClick={() => void handleResetMemory()}
              >
                <Trash2 size={16} />
                Reset
              </button>
            </div>

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
            {demoResult ? <DemoImpactPanel result={demoResult} /> : null}

            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="panel-title">Live context timeline</h2>
                <p className="panel-copy">
                  All proxy traffic — dashboard runs and terminal{" "}
                  <code>codex</code> CLI calls. Updates every 1.5s.
                </p>
              </div>
              <LiveIndicator status={liveStatus} />
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
                <h2 className="panel-title">Active memory</h2>
                <p className="panel-copy">
                  {metrics.approvedRules > 0
                    ? `${metrics.approvedRules} approved memor${metrics.approvedRules === 1 ? "y is" : "ies are"} eligible for retrieval and injection when relevant.`
                    : "Approved memory can be retrieved into future requests routed through Signal Recycler."}
                </p>
              </div>
              <button
                className="icon-button"
                aria-label="Add manual memory"
                title="Add memory"
                onClick={() => setManualRuleOpen((open) => !open)}
              >
                <Sparkles size={16} />
              </button>
            </div>
            {manualRuleOpen ? (
              <ManualRuleForm
                form={manualRuleForm}
                setForm={setManualRuleForm}
                onCancel={() => setManualRuleOpen(false)}
                onSubmit={handleCreateManualRule}
              />
            ) : (
              <button className="secondary-button justify-center" onClick={() => setManualRuleOpen(true)}>
                <Sparkles size={15} />
                Add memory
              </button>
            )}
            <RuleGroup
              title="Candidate memory"
              rules={rules.filter((r) => r.status === "pending")}
              onAction={handleRuleAction}
            />
            <RuleGroup
              title="Approved memory"
              rules={rules.filter((r) => r.status === "approved")}
              onAction={handleRuleAction}
            />
            <RuleGroup
              title="Rejected memory"
              rules={rules.filter((r) => r.status === "rejected")}
              onAction={handleRuleAction}
            />
          </aside>
        </section>
      </div>
    </main>
  );
}

function DemoImpactPanel({ result }: { result: DemoRunResult }) {
  const itemDelta = result.phase2.items - result.phase1.items;
  const durationDeltaSec = (result.phase1.durationMs - result.phase2.durationMs) / 1000;
  return (
    <section className="mb-5 rounded-xl border-2 border-[#9db92d] bg-gradient-to-br from-[#f4fbe1] to-[#fffdf7] p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[#1d2528]">Demo impact</h2>
          <p className="text-xs text-[#5f6868]">
            Same task, run twice — before and after the proxy learned the project's constraint.
          </p>
        </div>
        <Sparkles className="text-[#9db92d]" size={26} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <ImpactColumn
          tone="rose"
          label="Phase 1 — without memory"
          subtitle={
            result.phase1.rulesCreated
              ? `${result.phase1.rulesCreated} memory candidate(s) extracted`
              : "No memory yet"
          }
          response={result.phase1.finalResponse}
          stats={[
            { label: "Items", value: result.phase1.items.toString() },
            { label: "Duration", value: `${(result.phase1.durationMs / 1000).toFixed(1)}s` }
          ]}
        />
        <ImpactColumn
          tone="lime"
          label="Phase 2 — with memory"
          subtitle="Memory injected"
          response={result.phase2.finalResponse}
          stats={[
            { label: "Items", value: result.phase2.items.toString() },
            { label: "Duration", value: `${(result.phase2.durationMs / 1000).toFixed(1)}s` }
          ]}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded bg-white/70 p-2 text-xs">
        <span className="font-semibold uppercase tracking-wider text-[#5f6868]">Δ Result</span>
        <span className="rounded bg-[#e9f9a8] px-2 py-0.5 font-mono">
          {itemDelta < 0 ? `${itemDelta}` : `+${itemDelta}`} items
        </span>
        <span className="rounded bg-[#e9f9a8] px-2 py-0.5 font-mono">
          {durationDeltaSec >= 0 ? `${durationDeltaSec.toFixed(1)}s faster` : `${(-durationDeltaSec).toFixed(1)}s slower`}
        </span>
      </div>
    </section>
  );
}

function ImpactColumn({
  tone,
  label,
  subtitle,
  response,
  stats
}: {
  tone: "rose" | "lime";
  label: string;
  subtitle: string;
  response: string;
  stats: Array<{ label: string; value: string }>;
}) {
  const bg = tone === "rose" ? "bg-[#ffe0d9]" : "bg-[#e9f9a8]";
  const accent = tone === "rose" ? "text-[#8b2c13]" : "text-[#5d7517]";
  return (
    <div className={`${bg} rounded border border-black/10 p-3`}>
      <div className={`text-xs font-bold uppercase ${accent}`}>{label}</div>
      <div className="text-[10px] text-[#5f6868]">{subtitle}</div>
      <div className="mt-2 grid grid-cols-2 gap-1">
        {stats.map((s) => (
          <div key={s.label} className="rounded bg-white/70 px-2 py-1 text-xs">
            <div className="text-[10px] uppercase text-[#5f6868]">{s.label}</div>
            <div className="font-mono font-semibold tabular-nums">{s.value}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 line-clamp-4 max-h-24 overflow-hidden text-xs leading-5 text-[#263033]">
        {response}
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
  highlight = false
}: {
  label: string;
  value: number;
  tone: string;
  highlight?: boolean;
}) {
  const toneClass =
    tone === "emerald"
      ? "bg-[#dff5df]"
      : tone === "rose"
        ? "bg-[#ffe0d9]"
        : tone === "lime"
          ? "bg-[#e9f9a8]"
          : tone === "amber"
            ? "bg-[#ffe8b3]"
            : "bg-[#ece5d8]";
  return (
    <div
      className={`${toneClass} ${highlight ? "ring-2 ring-[#9db92d]/40" : ""} min-w-32 rounded border border-black/10 px-4 py-3 transition-all`}
    >
      <div className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</div>
      <div className="text-xs font-medium uppercase text-[#5f6868]">{label}</div>
    </div>
  );
}

function LiveIndicator({ status }: { status: "idle" | "live" | "connected" }) {
  const color =
    status === "live"
      ? "bg-[#22c55e]"
      : status === "connected"
        ? "bg-[#9db92d]"
        : "bg-[#cbd5d0]";
  const label = status === "idle" ? "WAITING" : status === "live" ? "LIVE" : "CONNECTED";
  return (
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#627067]">
      <div className="relative flex size-2.5">
        {status !== "idle" && (
          <span className={`absolute inline-flex size-full animate-ping rounded-full ${color} opacity-60`} />
        )}
        <span className={`relative inline-flex size-2.5 rounded-full ${color}`} />
      </div>
      {label}
      <Activity className="text-[#627067]" size={16} />
    </div>
  );
}

function TimelineRow({ event }: { event: TimelineEvent }) {
  const styling = chipStyleForCategory(event.category);
  const meta = event.metadata as Record<string, unknown>;

  if (event.category === "proxy_request") {
    return <ProxyRequestRow event={event} meta={meta} />;
  }

  return (
    <article className="timeline-row">
      <div className={`timeline-dot ${styling.dotClass}`} />
      <div className="min-w-0">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className={styling.chipClass}>
            {styling.icon}
            {styling.label ?? event.category.replace(/_/g, " ")}
          </span>
          <time className="text-xs text-[#747b76]">
            {new Date(event.createdAt).toLocaleTimeString()}
          </time>
        </div>
        <h3 className="text-sm font-semibold">{event.title}</h3>
        {event.category === "memory_retrieval" ? <MemoryRetrievalCounts meta={meta} /> : null}
        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#4f5a59]">{event.body}</p>
      </div>
    </article>
  );
}

function MemoryRetrievalCounts({ meta }: { meta: Record<string, unknown> }) {
  const selected = retrievalCount(meta, "selectedMemories", "selected");
  const skipped = retrievalCount(meta, "skippedMemories", "skipped");
  const approved = retrievalCount(meta, "approvedMemories");

  if (selected === null && skipped === null) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {selected !== null ? (
        <span className="inline-flex rounded bg-[#e9f9a8] px-2 py-1 text-xs font-medium text-[#5d7517]">
          Selected {selected}
        </span>
      ) : null}
      {skipped !== null ? (
        <span className="inline-flex rounded bg-[#ece5d8] px-2 py-1 text-xs font-medium text-[#66706c]">
          Skipped {skipped}
        </span>
      ) : null}
      {approved !== null ? (
        <span className="inline-flex rounded bg-white/70 px-2 py-1 text-xs font-medium text-[#66706c]">
          Approved {approved}
        </span>
      ) : null}
    </div>
  );
}

function retrievalCount(
  meta: Record<string, unknown>,
  metricKey: string,
  arrayKey?: string
): number | null {
  const direct = numberValue(meta[metricKey]);
  if (direct !== null) return direct;

  const metrics = meta["metrics"];
  if (metrics && typeof metrics === "object" && !Array.isArray(metrics)) {
    const metric = numberValue((metrics as Record<string, unknown>)[metricKey]);
    if (metric !== null) return metric;
  }

  if (arrayKey) {
    const value = meta[arrayKey];
    if (Array.isArray(value)) return value.length;
  }

  return null;
}

function numberValue(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const count = Number(value);
  return Number.isFinite(count) ? count : null;
}

function ProxyRequestRow({
  event,
  meta
}: {
  event: TimelineEvent;
  meta: Record<string, unknown>;
}) {
  const originalSize = Number(meta["originalSize"] ?? 0);
  const finalSize = Number(meta["finalSize"] ?? 0);
  const tokensRemoved = Number(meta["tokensRemoved"] ?? 0);
  const compressions = Number(meta["compressions"] ?? 0);
  const injectedRules = Number(meta["injectedRules"] ?? 0);
  const sizeDelta = finalSize - originalSize;
  const hasTransform = compressions > 0 || injectedRules > 0;

  return (
    <article className="timeline-row">
      <div className={`timeline-dot ${hasTransform ? "bg-[#22c55e]" : "bg-[#cbd5d0]"}`} />
      <div className="min-w-0">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="event-chip bg-[#dff5df] text-[#1f6f3a]">proxy request</span>
          <time className="text-xs text-[#747b76]">
            {new Date(event.createdAt).toLocaleTimeString()}
          </time>
        </div>
        <h3 className="font-mono text-sm font-semibold">{event.title}</h3>

        {originalSize > 0 ? (
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <SizeCell label="Before" value={`${originalSize.toLocaleString()} ch`} tone="stone" />
            <SizeCell
              label="Δ"
              value={`${sizeDelta >= 0 ? "+" : ""}${sizeDelta.toLocaleString()}`}
              tone={sizeDelta < 0 ? "lime" : sizeDelta > 0 ? "amber" : "stone"}
            />
            <SizeCell label="After" value={`${finalSize.toLocaleString()} ch`} tone="emerald" />
          </div>
        ) : null}

        {hasTransform ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {compressions > 0 ? (
              <span className="inline-flex items-center gap-1 rounded bg-[#fff3cd] px-2 py-1 text-xs font-medium text-[#7a5c00]">
                <Zap size={12} />
                Compressed {compressions} (~{tokensRemoved.toLocaleString()} tok)
              </span>
            ) : null}
            {injectedRules > 0 ? (
              <span className="inline-flex items-center gap-1 rounded bg-[#e9f9a8] px-2 py-1 text-xs font-medium text-[#5d7517]">
                <Sparkles size={12} />
                Memory injected: {injectedRules}
              </span>
            ) : null}
          </div>
        ) : (
          <p className="mt-1 text-xs italic text-[#8b918b]">Forwarded unchanged.</p>
        )}
      </div>
    </article>
  );
}

function SizeCell({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone: "stone" | "emerald" | "lime" | "amber";
}) {
  const toneBg =
    tone === "emerald"
      ? "bg-[#dff5df]"
      : tone === "lime"
        ? "bg-[#e9f9a8]"
        : tone === "amber"
          ? "bg-[#ffe8b3]"
          : "bg-[#ece5d8]";
  return (
    <div className={`${toneBg} rounded border border-black/5 px-2 py-1`}>
      <div className="text-[10px] font-semibold uppercase text-[#5f6868]">{label}</div>
      <div className="font-mono text-xs tabular-nums">{value}</div>
    </div>
  );
}

function chipStyleForCategory(category: string): {
  chipClass: string;
  dotClass: string;
  icon: React.ReactNode;
  label?: string;
} {
  switch (category) {
    case "compression_result":
      return {
        chipClass:
          "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#fff3cd] text-[#7a5c00] border border-[#ffe08a]",
        dotClass: "bg-[#f59e0b]",
        icon: <Zap size={10} />
      };
    case "rule_auto_approved":
      return {
        chipClass:
          "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#e9f9a8] text-[#5d7517] border border-[#cfe065]",
        dotClass: "bg-[#9db92d]",
        icon: <Sparkles size={10} />,
        label: "Approved memory"
      };
    case "rule_candidate":
      return {
        chipClass: "event-chip bg-[#ffe0d9] text-[#8b2c13]",
        dotClass: "bg-[#dc2626]",
        icon: null,
        label: "Candidate memory"
      };
    case "memory_retrieval":
      return {
        chipClass:
          "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#e9f9a8] text-[#5d7517] border border-[#cfe065]",
        dotClass: "bg-[#9db92d]",
        icon: <Sparkles size={10} />,
        label: "Memory context"
      };
    default:
      return { chipClass: "event-chip", dotClass: "", icon: null };
  }
}

function ManualRuleForm({
  form,
  setForm,
  onSubmit,
  onCancel
}: {
  form: { category: string; rule: string; reason: string };
  setForm: React.Dispatch<
    React.SetStateAction<{ category: string; rule: string; reason: string }>
  >;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onCancel: () => void;
}) {
  return (
    <form className="rounded border border-[#d7d0c2] bg-[#fffdf7] p-3" onSubmit={(event) => void onSubmit(event)}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase text-[#66706c]">Add approved memory</h3>
        <button className="icon-button" type="button" aria-label="Cancel add memory" onClick={onCancel}>
          <X size={14} />
        </button>
      </div>
      <label className="mb-2 block text-xs font-semibold uppercase text-[#66706c]" htmlFor="manual-rule-category">
        Category
      </label>
      <input
        id="manual-rule-category"
        className="mb-3 w-full rounded border border-[#cfc6b5] bg-white px-3 py-2 text-sm outline-none focus:border-[#1d2528]"
        value={form.category}
        onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
        placeholder="guardrail"
        required
        minLength={2}
      />
      <label className="mb-2 block text-xs font-semibold uppercase text-[#66706c]" htmlFor="manual-rule-rule">
        Memory
      </label>
      <textarea
        id="manual-rule-rule"
        className="mb-3 min-h-20 w-full resize-none rounded border border-[#cfc6b5] bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[#1d2528]"
        value={form.rule}
        onChange={(event) => setForm((current) => ({ ...current, rule: event.target.value }))}
        placeholder="For frontend tasks, never modify apps/api unless explicitly asked."
        required
        minLength={8}
      />
      <label className="mb-2 block text-xs font-semibold uppercase text-[#66706c]" htmlFor="manual-rule-reason">
        Reason
      </label>
      <textarea
        id="manual-rule-reason"
        className="mb-3 min-h-16 w-full resize-none rounded border border-[#cfc6b5] bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[#1d2528]"
        value={form.reason}
        onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
        placeholder="This is a deliberate repo boundary, not something Codex should infer from failure."
        required
        minLength={8}
      />
      <div className="grid grid-cols-2 gap-2">
        <button className="secondary-button justify-center" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="primary-button justify-center py-2" type="submit">
          <Sparkles size={15} />
          Add memory
        </button>
      </div>
    </form>
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
            No {title.toLowerCase()}.
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
                      aria-label="Approve memory"
                      onClick={() => void onAction(rule.id, "approve")}
                    >
                      <Check size={15} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Reject memory"
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
      <div className="max-w-md px-6">
        <Activity className="mx-auto mb-3 text-[#9db92d]" size={32} />
        <h3 className="text-base font-semibold">Waiting for Codex traffic…</h3>
        <p className="mt-2 text-sm leading-6 text-[#66706c]">
          Press <strong>Run learn → use demo</strong> on the left for a guided arc, or send a free
          prompt, or pipe your terminal codex CLI through the proxy.
        </p>
      </div>
    </div>
  );
}
