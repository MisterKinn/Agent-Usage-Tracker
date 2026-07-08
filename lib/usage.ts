import type { Timestamp } from "firebase/firestore";

export type UsageSummary = {
  id: string;
  summaryId: string;
  dateKey: string;
  agent: "codex" | "claude" | "unknown";
  ownerName: string;
  authUid: string;
  authEmail: string;
  events: number;
  sessions: number;
  inputTokens: number;
  cachedTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  source: string;
  lastCompletedAt: Timestamp | Date | null;
  syncedAt: Timestamp | Date | null;
};

export type OwnerSummary = {
  ownerName: string;
  events: number;
  sessions: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
};

export type AgentSummary = {
  agent: string;
  events: number;
  sessions: number;
  totalTokens: number;
};

export function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

export function summarizeByOwner(items: UsageSummary[]): OwnerSummary[] {
  const map = new Map<string, OwnerSummary>();

  for (const item of items) {
    const ownerName = item.ownerName || "unassigned";
    const existing =
      map.get(ownerName) ??
      ({
        ownerName,
        events: 0,
        sessions: 0,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
      } satisfies OwnerSummary);

    existing.events += item.events || 0;
    existing.sessions += item.sessions || 0;
    existing.totalTokens += item.totalTokens || 0;
    existing.inputTokens += item.inputTokens || 0;
    existing.outputTokens += item.outputTokens || 0;
    existing.cachedTokens += item.cachedTokens || 0;
    map.set(ownerName, existing);
  }

  return Array.from(map.values()).sort((a, b) => b.totalTokens - a.totalTokens);
}

export function summarizeByAgent(items: UsageSummary[]): AgentSummary[] {
  const map = new Map<string, AgentSummary>();

  for (const item of items) {
    const agent = item.agent || "unknown";
    const existing =
      map.get(agent) ??
      ({
        agent,
        events: 0,
        sessions: 0,
        totalTokens: 0,
      } satisfies AgentSummary);

    existing.events += item.events || 0;
    existing.sessions += item.sessions || 0;
    existing.totalTokens += item.totalTokens || 0;
    map.set(agent, existing);
  }

  return Array.from(map.values()).sort((a, b) => b.totalTokens - a.totalTokens);
}

export function toDate(value: UsageSummary["lastCompletedAt"]) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  return value.toDate();
}
