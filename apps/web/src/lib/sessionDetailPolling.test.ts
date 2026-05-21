import { describe, expect, it } from "vitest";
import {
  ACTIVE_SESSION_DETAIL_POLL_INTERVAL_MS,
  IDLE_SESSION_DETAIL_POLL_INTERVAL_MS,
  isSessionDetailRunActive,
  sessionDetailSyncMode,
  sessionDetailPollInterval
} from "./sessionDetailPolling";

describe("session detail polling", () => {
  it("does not poll without a selected session", () => {
    expect(sessionDetailPollInterval({ hasSelectedSession: false, runActive: true })).toBeNull();
  });

  it("polls quickly while a session run is active", () => {
    expect(sessionDetailPollInterval({ hasSelectedSession: true, runActive: true })).toBe(
      ACTIVE_SESSION_DETAIL_POLL_INTERVAL_MS
    );
  });

  it("backs off when the selected session is idle", () => {
    expect(sessionDetailPollInterval({ hasSelectedSession: true, runActive: false })).toBe(
      IDLE_SESSION_DETAIL_POLL_INTERVAL_MS
    );
  });

  it("prefers the event stream when EventSource is available and healthy", () => {
    expect(
      sessionDetailSyncMode({
        hasSelectedSession: true,
        eventSourceAvailable: true,
        streamFailed: false
      })
    ).toBe("stream");
  });

  it("falls back to polling when event streaming is unavailable or failed", () => {
    expect(
      sessionDetailSyncMode({
        hasSelectedSession: true,
        eventSourceAvailable: false,
        streamFailed: false
      })
    ).toBe("poll");
    expect(
      sessionDetailSyncMode({
        hasSelectedSession: true,
        eventSourceAvailable: true,
        streamFailed: true
      })
    ).toBe("poll");
  });

  it("does not poll or stream without a selected session", () => {
    expect(
      sessionDetailSyncMode({
        hasSelectedSession: false,
        eventSourceAvailable: true,
        streamFailed: false
      })
    ).toBe("off");
  });

  it("treats continued runs as active for the selected detail session", () => {
    expect(
      isSessionDetailRunActive({
        selectedSessionId: "session_1",
        continuedSessionRunning: true,
        continuedSessionId: "session_1",
        newSessionRunning: false,
        optimisticSessionId: null
      })
    ).toBe(true);
  });

  it("ignores continued runs for a different selected detail session", () => {
    expect(
      isSessionDetailRunActive({
        selectedSessionId: "session_2",
        continuedSessionRunning: true,
        continuedSessionId: "session_1",
        newSessionRunning: false,
        optimisticSessionId: null
      })
    ).toBe(false);
  });

  it("does not treat any run as active without a selected detail session", () => {
    expect(
      isSessionDetailRunActive({
        selectedSessionId: null,
        continuedSessionRunning: true,
        continuedSessionId: "session_1",
        newSessionRunning: true,
        optimisticSessionId: "session_new"
      })
    ).toBe(false);
  });

  it("treats the optimistic new session as active only while it is selected", () => {
    expect(
      isSessionDetailRunActive({
        selectedSessionId: "session_new",
        continuedSessionRunning: false,
        continuedSessionId: null,
        newSessionRunning: true,
        optimisticSessionId: "session_new"
      })
    ).toBe(true);
    expect(
      isSessionDetailRunActive({
        selectedSessionId: "session_other",
        continuedSessionRunning: false,
        continuedSessionId: null,
        newSessionRunning: true,
        optimisticSessionId: "session_new"
      })
    ).toBe(false);
  });

  it("treats a selected optimistic new session as active during another continued run", () => {
    expect(
      isSessionDetailRunActive({
        selectedSessionId: "session_new",
        continuedSessionRunning: true,
        continuedSessionId: "session_1",
        newSessionRunning: true,
        optimisticSessionId: "session_new"
      })
    ).toBe(true);
  });
});
