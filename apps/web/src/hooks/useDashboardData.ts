import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MemoryRecord, SessionRecord, TimelineEvent } from "@signal-recycler/shared";
import { fetchConfig, listFirehose, listMemories, listSessions, type ApiConfig } from "../api";

const POLL_INTERVAL_MS = 1500;
const FIREHOSE_POLL_LIMIT = 250;

export function useDashboardData() {
  const [config, setConfig] = useState<ApiConfig | null>(null);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(false);
  const latestRefreshIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const refreshId = latestRefreshIdRef.current + 1;
    latestRefreshIdRef.current = refreshId;

    const [configResult, sessionsResult, eventsResult, memoriesResult] = await Promise.allSettled([
      fetchConfig(),
      listSessions(),
      listFirehose(FIREHOSE_POLL_LIMIT),
      listMemories()
    ] as const);
    if (!mountedRef.current || refreshId !== latestRefreshIdRef.current) return;

    const failures: string[] = [];
    if (configResult.status === "fulfilled") setConfig(configResult.value);
    else failures.push(`config: ${errorMessage(configResult.reason)}`);

    if (sessionsResult.status === "fulfilled") setSessions(sessionsResult.value);
    else failures.push(`sessions: ${errorMessage(sessionsResult.reason)}`);

    if (eventsResult.status === "fulfilled") setEvents(eventsResult.value);
    else failures.push(`events: ${errorMessage(eventsResult.reason)}`);

    if (memoriesResult.status === "fulfilled") setMemories(memoriesResult.value);
    else failures.push(`memory: ${errorMessage(memoriesResult.reason)}`);

    if (failures.length > 0) {
      throw new Error(`Dashboard refresh partially failed: ${failures.join("; ")}`);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    mountedRef.current = true;

    async function poll() {
      try {
        await refresh();
        if (cancelled) return;
        setError(null);
        setLoading(false);
      } catch (refreshError: unknown) {
        if (!cancelled) {
          setError(errorMessage(refreshError));
          setLoading(false);
        }
      }

      if (!cancelled) {
        timeout = setTimeout(() => {
          void poll();
        }, POLL_INTERVAL_MS);
      }
    }

    void poll();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      if (timeout) clearTimeout(timeout);
    };
  }, [refresh]);

  const eventsBySession = useMemo(() => {
    const grouped = new Map<string, TimelineEvent[]>();
    for (const event of events) {
      const bucket = grouped.get(event.sessionId);
      if (bucket) {
        bucket.push(event);
      } else {
        grouped.set(event.sessionId, [event]);
      }
    }
    return grouped;
  }, [events]);

  return {
    config,
    sessions,
    events,
    eventsBySession,
    memories,
    loading,
    error,
    setError,
    refresh
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
