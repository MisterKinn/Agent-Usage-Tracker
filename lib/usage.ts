import type { Timestamp } from "firebase/firestore";

export type UsageSummary = {
  id: string;
  summaryId: string;
  dateKey: string;
  agent: "codex" | "claude" | "unknown";
  ownerName: string;
  ownerId: string;
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
  ownerId: string;
  ownerName: string;
  events: number;
  sessions: number;
  totalTokens: number;
  rawTotalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
};

export type AgentSummary = {
  agent: string;
  events: number;
  sessions: number;
  totalTokens: number;
  rawTotalTokens: number;
};

export function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

export function activeTokenCount(item: Pick<UsageSummary, "totalTokens" | "cachedTokens">) {
  return Math.max((item.totalTokens || 0) - (item.cachedTokens || 0), 0);
}

export function summarizeByOwner(items: UsageSummary[]): OwnerSummary[] {
  const map = new Map<string, OwnerSummary & { lastCompletedAtMs: number }>();

  for (const item of items) {
    const ownerName = item.ownerName || "unassigned";
    const ownerId = item.ownerId || ownerName;
    const completedAtMs = toDate(item.lastCompletedAt)?.getTime() ?? 0;
    const existing =
      map.get(ownerId) ??
      ({
        ownerId,
        ownerName,
        events: 0,
        sessions: 0,
        totalTokens: 0,
        rawTotalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        lastCompletedAtMs: 0,
      } satisfies OwnerSummary & { lastCompletedAtMs: number });

    if (completedAtMs >= existing.lastCompletedAtMs && ownerName) {
      existing.ownerName = ownerName;
      existing.lastCompletedAtMs = completedAtMs;
    }
    existing.events += item.events || 0;
    existing.sessions += item.sessions || 0;
    existing.totalTokens += activeTokenCount(item);
    existing.rawTotalTokens += item.totalTokens || 0;
    existing.inputTokens += item.inputTokens || 0;
    existing.outputTokens += item.outputTokens || 0;
    existing.cachedTokens += item.cachedTokens || 0;
    map.set(ownerId, existing);
  }

  return Array.from(map.values())
    .map(({ lastCompletedAtMs: _lastCompletedAtMs, ...item }) => item)
    .sort((a, b) => b.totalTokens - a.totalTokens);
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
        rawTotalTokens: 0,
      } satisfies AgentSummary);

    existing.events += item.events || 0;
    existing.sessions += item.sessions || 0;
    existing.totalTokens += activeTokenCount(item);
    existing.rawTotalTokens += item.totalTokens || 0;
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
