import { useEffect, useMemo, useState } from "react";
import type { AgentAdapter, SessionRecord, TimelineEvent } from "@signal-recycler/shared";
import { createSession, listEvents, runSession } from "./api";
import { AppShell } from "./components/AppShell";
import { Button } from "./components/Button";
import { useDashboardData } from "./hooks/useDashboardData";
import { buildDashboardMetrics } from "./lib/sessionPresenters";
import type { AppRoute } from "./types";
import { DashboardView } from "./views/DashboardView";
import { ContextIndexView } from "./views/ContextIndexView";
import { EvalsView } from "./views/EvalsView";
import { MemoryView } from "./views/MemoryView";
import { SessionDetailView } from "./views/SessionDetailView";
import { SessionsView } from "./views/SessionsView";

const adapterOptions = [
  { value: "default", label: "Auto adapter" },
  { value: "mock", label: "Mock" },
  { value: "codex_cli", label: "Codex CLI" },
  { value: "codex_sdk", label: "Codex SDK" }
] satisfies Array<{ value: AgentAdapter; label: string }>;

export function App() {
  const data = useDashboardData();
  const [route, setRoute] = useState<AppRoute>("dashboard");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [optimisticSession, setOptimisticSession] = useState<SessionRecord | null>(null);
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [newSessionRunning, setNewSessionRunning] = useState(false);
  const [sessionDetailEvents, setSessionDetailEvents] = useState<TimelineEvent[]>([]);
  const [sessionDetailLoading, setSessionDetailLoading] = useState(false);
  const [sessionDetailError, setSessionDetailError] = useState<string | null>(null);
  const [sessionDetailReloadKey, setSessionDetailReloadKey] = useState(0);

  const metrics = useMemo(
    () =>
      buildDashboardMetrics({
        sessions: data.sessions,
        events: data.events,
        memories: data.memories
      }),
    [data.events, data.memories, data.sessions]
  );

  const counts = useMemo(
    () => ({
      dashboard: data.events.length,
      sessions: data.sessions.length,
      memory: data.memories.length,
      context: metrics.recentContextEvents
    }),
    [data.events.length, data.memories.length, data.sessions.length, metrics.recentContextEvents]
  );

  async function handleNewSession(prompt: string, adapter: AgentAdapter) {
    const title = prompt.trim().slice(0, 80) || undefined;
    setNewSessionRunning(true);
    data.setError(null);

    try {
      const session = await createSession(title);
      setOptimisticSession(session);
      setSelectedSessionId(session.id);
      setRoute("session");
      setNewSessionOpen(false);

      try {
        await runSession(session.id, prompt, adapter);
      } finally {
        await data.refresh();
        setSessionDetailReloadKey((key) => key + 1);
      }
    } catch (newSessionError: unknown) {
      data.setError(errorMessage(newSessionError));
    } finally {
      setNewSessionRunning(false);
    }
  }

  function handleRouteChange(nextRoute: AppRoute) {
    setRoute(nextRoute);
  }

  const selectedSession =
    data.sessions.find((session) => session.id === selectedSessionId) ??
    (optimisticSession?.id === selectedSessionId ? optimisticSession : null) ??
    data.sessions[0] ??
    null;
  const selectedSessionIdForDetail = route === "session" ? (selectedSession?.id ?? null) : null;
  const selectedSessionFirehoseEventCount = selectedSessionIdForDetail
    ? (data.eventsBySession.get(selectedSessionIdForDetail)?.length ?? 0)
    : 0;

  useEffect(() => {
    if (!selectedSessionIdForDetail) {
      setSessionDetailEvents([]);
      setSessionDetailError(null);
      setSessionDetailLoading(false);
      return;
    }

    let cancelled = false;
    setSessionDetailEvents([]);
    setSessionDetailError(null);
    setSessionDetailLoading(true);

    listEvents(selectedSessionIdForDetail)
      .then((events) => {
        if (!cancelled) setSessionDetailEvents(events);
      })
      .catch((error: unknown) => {
        if (!cancelled) setSessionDetailError(errorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setSessionDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSessionFirehoseEventCount, selectedSessionIdForDetail, sessionDetailReloadKey]);

  return (
    <AppShell
      config={data.config}
      route={route}
      counts={counts}
      onRouteChange={handleRouteChange}
      onNewSession={() => {
        if (!newSessionRunning) setNewSessionOpen(true);
      }}
    >
      <section className={route === "session" || route === "memory" ? "" : "p-6"}>
        {data.error ? <ErrorBanner message={data.error} onDismiss={() => data.setError(null)} /> : null}
        {data.loading ? (
          <div className="rounded-md border border-stone-200 bg-white p-4 text-sm text-stone-500">
            Loading Signal Recycler data...
          </div>
        ) : (
          <>
            {route === "dashboard" ? (
              <DashboardView
                events={data.events}
                eventsBySession={data.eventsBySession}
                memories={data.memories}
                onOpenMemory={() => setRoute("memory")}
                onOpenSession={(sessionId) => {
                  setSelectedSessionId(sessionId);
                  setRoute("session");
                }}
                sessions={data.sessions}
              />
            ) : null}
            {route === "sessions" ? (
              <SessionsView
                eventsBySession={data.eventsBySession}
                memories={data.memories}
                onOpenSession={(sessionId) => {
                  setSelectedSessionId(sessionId);
                  setRoute("session");
                }}
                sessions={data.sessions}
              />
            ) : null}
            {route === "session" ? (
              <SessionDetailView
                events={sessionDetailEvents}
                eventsError={sessionDetailError}
                eventsLoading={sessionDetailLoading}
                memories={data.memories}
                onBack={() => setRoute("sessions")}
                onRetryEvents={() => setSessionDetailReloadKey((key) => key + 1)}
                session={selectedSession}
              />
            ) : null}
            {route === "memory" ? <MemoryView memories={data.memories} onChanged={data.refresh} /> : null}
            {route === "context" ? <ContextIndexView /> : null}
            {route === "evals" ? <EvalsView /> : null}
            {route !== "dashboard" &&
            route !== "sessions" &&
            route !== "session" &&
            route !== "memory" &&
            route !== "context" &&
            route !== "evals" ? (
              <RoutePlaceholder route={route} selectedSession={selectedSession} />
            ) : null}
          </>
        )}
      </section>
      {newSessionOpen ? (
        <NewSessionModal
          availableAdapters={data.config?.availableAdapters ?? ["default"]}
          running={newSessionRunning}
          onCancel={() => setNewSessionOpen(false)}
          onSubmit={(prompt, adapter) => {
            void handleNewSession(prompt, adapter);
          }}
        />
      ) : null}
    </AppShell>
  );
}

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      <span className="break-words">{message}</span>
      <button className="font-semibold" onClick={onDismiss} type="button">
        Dismiss
      </button>
    </div>
  );
}

function RoutePlaceholder({
  route,
  selectedSession
}: {
  route: AppRoute;
  selectedSession: SessionRecord | null;
}) {
  if (
    route === "dashboard" ||
    route === "sessions" ||
    route === "session" ||
    route === "memory" ||
    route === "context" ||
    route === "evals"
  ) {
    return null;
  }

  const copy: Record<
    Exclude<AppRoute, "dashboard" | "sessions" | "session" | "memory" | "context" | "evals">,
    { title: string; body: string }
  > = {
    sync: {
      title: "Sync placeholder",
      body: "Signal Recycler remains local-first here. Cloud sync is out of scope for this phase task."
    },
    settings: {
      title: "Settings placeholder",
      body: "Runtime configuration is read from the API. Editable settings are not implemented in this task."
    }
  };
  const content = copy[route];

  return (
    <PlaceholderFrame title={content.title}>
      <p>{content.body}</p>
      {selectedSession ? (
        <p className="mt-3 font-mono text-xs text-stone-400">Current session selection: {selectedSession.id}</p>
      ) : null}
    </PlaceholderFrame>
  );
}

function PlaceholderFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-stone-300 bg-white p-6 text-sm leading-6 text-stone-600">
      <h2 className="text-base font-semibold text-stone-950">{title}</h2>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function NewSessionModal({
  availableAdapters,
  running,
  onCancel,
  onSubmit
}: {
  availableAdapters: AgentAdapter[];
  running: boolean;
  onCancel: () => void;
  onSubmit: (prompt: string, adapter: AgentAdapter) => void;
}) {
  const options = adapterOptions.filter((option) => availableAdapters.includes(option.value));

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/20 p-4">
      <form
        className="w-full max-w-xl rounded-lg border border-stone-200 bg-white p-4 shadow-xl"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const prompt = String(form.get("prompt") ?? "").trim();
          const adapter = String(form.get("adapter") ?? "default") as AgentAdapter;
          if (!prompt) return;
          onSubmit(prompt, adapter);
        }}
      >
        <h2 className="text-lg font-semibold text-stone-950">New session</h2>
        <p className="mt-1 text-sm text-stone-500">
          Create a Signal Recycler-owned session and run it with the selected adapter.
        </p>
        <label className="mt-4 block text-sm font-medium text-stone-700" htmlFor="new-session-prompt">
          Prompt
        </label>
        <textarea
          className="mt-2 min-h-32 w-full resize-y rounded-md border border-stone-300 p-3 text-sm outline-none focus:border-stone-500"
          disabled={running}
          id="new-session-prompt"
          name="prompt"
          placeholder="What should the agent do?"
          required
        />
        <label className="mt-3 block text-sm font-medium text-stone-700" htmlFor="new-session-adapter">
          Adapter
        </label>
        <select
          className="mt-2 w-full rounded-md border border-stone-300 p-2 text-sm outline-none focus:border-stone-500"
          defaultValue="default"
          disabled={running}
          id="new-session-adapter"
          name="adapter"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={onCancel} type="button">
            Cancel
          </Button>
          <Button disabled={running} type="submit" variant="primary">
            {running ? "Running..." : "Run session"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
