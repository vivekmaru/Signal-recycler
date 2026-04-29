import type { PlaybookRule, SessionRecord, TimelineEvent } from "@signal-recycler/shared";

export type ApiConfig = {
  projectId: string;
  workingDirectory: string;
  workingDirectoryBasename: string;
};

export async function fetchConfig(): Promise<ApiConfig> {
  return readJson(await fetch("/api/config"));
}

export type RunResult = {
  finalResponse: string;
  candidateRules: PlaybookRule[];
};

export async function createSession(title?: string): Promise<SessionRecord> {
  const response = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title })
  });
  return readJson(response);
}

export async function listRules(): Promise<PlaybookRule[]> {
  return readJson(await fetch("/api/rules"));
}

export async function listEvents(sessionId: string): Promise<TimelineEvent[]> {
  return readJson(await fetch(`/api/sessions/${sessionId}/events`));
}

export async function runSession(sessionId: string, prompt: string): Promise<RunResult> {
  const response = await fetch(`/api/sessions/${sessionId}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt })
  });
  return readJson(response);
}

export async function approveRule(id: string): Promise<PlaybookRule> {
  return readJson(await fetch(`/api/rules/${id}/approve`, { method: "POST" }));
}

export async function rejectRule(id: string): Promise<PlaybookRule> {
  return readJson(await fetch(`/api/rules/${id}/reject`, { method: "POST" }));
}

export async function exportPlaybook(): Promise<string> {
  const response = await fetch("/api/playbook/export");
  if (!response.ok) throw new Error(await response.text());
  return response.text();
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}
