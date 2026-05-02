import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MemoryRecord, SessionRecord, TimelineEvent } from "@signal-recycler/shared";
import { fetchConfig, listFirehose, listMemories, listSessions, type ApiConfig } from "../api";

const POLL_INTERVAL_MS = 1500;

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
    let nextConfig: ApiConfig;
    let nextSessions: SessionRecord[];
    let nextEvents: TimelineEvent[];
    let nextMemories: MemoryRecord[];

    try {
      [nextConfig, nextSessions, nextEvents, nextMemories] = await Promise.all([
        fetchConfig(),
        listSessions(),
        listFirehose(250),
        listMemories()
      ]);
    } catch (refreshError: unknown) {
      if (mountedRef.current && refreshId === latestRefreshIdRef.current) throw refreshError;
      return;
    }

    if (!mountedRef.current || refreshId !== latestRefreshIdRef.current) return;
    setConfig(nextConfig);
    setSessions(nextSessions);
    setEvents(nextEvents);
    setMemories(nextMemories);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    mountedRef.current = true;

    async function poll() {
      try {
        await refresh();
        if (cancelled) return;
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
      grouped.set(event.sessionId, [...(grouped.get(event.sessionId) ?? []), event]);
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
