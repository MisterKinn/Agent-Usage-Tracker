import type { Timestamp } from "firebase/firestore";

export type UsageEvent = {
  id: string;
  agent: "codex" | "claude" | "unknown";
  ownerName: string;
  authUid: string;
  authEmail: string;
  sessionId: string;
  sessionName: string;
  responseId: string;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  model: string;
  source: "codex-local-log" | "claude-code-jsonl";
  completedAt: Timestamp | Date | null;
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

export function summarizeByOwner(events: UsageEvent[]): OwnerSummary[] {
  const map = new Map<string, OwnerSummary & { sessionIds: Set<string> }>();

  for (const event of events) {
    const ownerName = event.ownerName || "unassigned";
    const item =
      map.get(ownerName) ??
      ({
        ownerName,
        events: 0,
        sessions: 0,
        sessionIds: new Set<string>(),
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
      } satisfies OwnerSummary & { sessionIds: Set<string> });

    item.events += 1;
    item.sessionIds.add(event.sessionId || "(missing)");
    item.totalTokens += event.totalTokens || 0;
    item.inputTokens += event.inputTokens || 0;
    item.outputTokens += event.outputTokens || 0;
    item.cachedTokens += event.cachedTokens || 0;
    map.set(ownerName, item);
  }

  return Array.from(map.values())
    .map(({ sessionIds, ...item }) => ({ ...item, sessions: sessionIds.size }))
    .sort((a, b) => b.totalTokens - a.totalTokens);
}

export function summarizeByAgent(events: UsageEvent[]): AgentSummary[] {
  const map = new Map<string, AgentSummary & { sessionIds: Set<string> }>();

  for (const event of events) {
    const agent = event.agent || "unknown";
    const item =
      map.get(agent) ??
      ({
        agent,
        events: 0,
        sessions: 0,
        sessionIds: new Set<string>(),
        totalTokens: 0,
      } satisfies AgentSummary & { sessionIds: Set<string> });

    item.events += 1;
    item.sessionIds.add(event.sessionId || "(missing)");
    item.totalTokens += event.totalTokens || 0;
    map.set(agent, item);
  }

  return Array.from(map.values())
    .map(({ sessionIds, ...item }) => ({ ...item, sessions: sessionIds.size }))
    .sort((a, b) => b.totalTokens - a.totalTokens);
}

export function toDate(value: UsageEvent["completedAt"]) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  return value.toDate();
}
