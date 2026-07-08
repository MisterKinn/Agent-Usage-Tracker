import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

type TrackerSummaryPayload = {
  summaryId?: string;
  dateKey?: string;
  ownerId?: string;
  ownerName?: string;
  agent?: string;
  events?: number;
  sessions?: number;
  inputTokens?: number;
  cachedTokens?: number;
  cacheCreationTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
  lastCompletedAt?: string;
  source?: string;
};

type TrackerEventPayload = {
  eventId?: string;
  ownerId?: string;
  ownerName?: string;
  agent?: string;
  sessionId?: string;
  inputTokens?: number;
  cachedTokens?: number;
  cacheCreationTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
  completedAt?: string;
  source?: string;
};

type TrackerSyncPayload = {
  ownerId?: string;
  ownerName?: string;
  agent?: string;
  workspacePath?: string;
  trackerPath?: string;
  trackerSource?: string;
  summaries?: TrackerSummaryPayload[];
  events?: TrackerEventPayload[];
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function parseIsoTimestamp(value: string | undefined, fallback: Date) {
  if (!value) {
    return Timestamp.fromDate(fallback);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return Timestamp.fromDate(fallback);
  }
  return Timestamp.fromDate(parsed);
}

function asNonEmptyString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function summarizeEvents(
  events: TrackerEventPayload[],
  ownerId: string,
  ownerName: string,
) {
  const grouped = new Map<string, TrackerSummaryPayload & { sessionIds: Set<string> }>();

  for (const event of events) {
    const completedAt = asNonEmptyString(event.completedAt);
    const dateKey = completedAt.slice(0, 10);
    const agent = asNonEmptyString(event.agent, "unknown");
    if (!dateKey) {
      continue;
    }

    const summaryId = `${dateKey}:${agent}:${ownerId}`;
    const current =
      grouped.get(summaryId) ??
      ({
        summaryId,
        dateKey,
        ownerId,
        ownerName,
        agent,
        events: 0,
        sessions: 0,
        inputTokens: 0,
        cachedTokens: 0,
        cacheCreationTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
        lastCompletedAt: completedAt,
        source: "daily-agent-summary",
        sessionIds: new Set<string>(),
      } satisfies TrackerSummaryPayload & { sessionIds: Set<string> });

    current.ownerName = asNonEmptyString(event.ownerName, ownerName);
    current.events = asNumber(current.events) + 1;
    current.inputTokens = asNumber(current.inputTokens) + asNumber(event.inputTokens);
    current.cachedTokens = asNumber(current.cachedTokens) + asNumber(event.cachedTokens);
    current.cacheCreationTokens =
      asNumber(current.cacheCreationTokens) + asNumber(event.cacheCreationTokens);
    current.outputTokens = asNumber(current.outputTokens) + asNumber(event.outputTokens);
    current.reasoningTokens =
      asNumber(current.reasoningTokens) + asNumber(event.reasoningTokens);
    current.totalTokens = asNumber(current.totalTokens) + asNumber(event.totalTokens);
    if (completedAt && completedAt > asNonEmptyString(current.lastCompletedAt)) {
      current.lastCompletedAt = completedAt;
    }
    const sessionId = asNonEmptyString(event.sessionId);
    if (sessionId) {
      current.sessionIds.add(sessionId);
      current.sessions = current.sessionIds.size;
    }
    grouped.set(summaryId, current);
  }

  return Array.from(grouped.values()).map(({ sessionIds: _sessionIds, ...summary }) => summary);
}

export async function POST(request: Request) {
  const expectedToken = process.env.TRACKER_WRITE_TOKEN?.trim();
  if (!expectedToken) {
    return jsonError("TRACKER_WRITE_TOKEN is not configured.", 503);
  }

  const authorization = request.headers.get("authorization") ?? "";
  if (authorization !== `Bearer ${expectedToken}`) {
    return jsonError("Unauthorized tracker request.", 401);
  }

  const body = (await request.json()) as TrackerSyncPayload;
  const ownerId = asNonEmptyString(body.ownerId);
  const ownerName = asNonEmptyString(body.ownerName, "unassigned");
  const agent = asNonEmptyString(body.agent, "all");
  const workspacePath = asNonEmptyString(body.workspacePath);
  const trackerPath = asNonEmptyString(body.trackerPath);
  const trackerSource = asNonEmptyString(body.trackerSource, "local-agent-log");
  const summaries = Array.isArray(body.summaries) ? body.summaries : [];
  const events = Array.isArray(body.events) ? body.events : [];

  if (!ownerId) {
    return jsonError("ownerId is required.", 400);
  }

  const normalizedSummaries =
    summaries.length > 0 ? summaries : summarizeEvents(events, ownerId, ownerName);

  const now = new Date();
  const db = adminDb();
  const batch = db.batch();

  batch.set(
    db.collection("trackerClients").doc(ownerId),
    {
      ownerId,
      ownerName,
      agent,
      lastSeenAt: FieldValue.serverTimestamp(),
      lastWorkspacePath: workspacePath,
      trackerPath,
      source: trackerSource,
    },
    { merge: true },
  );

  let summaryWrites = 0;
  for (const summary of normalizedSummaries) {
    const summaryId = asNonEmptyString(summary.summaryId);
    if (!summaryId) {
      continue;
    }

    batch.set(
      db.collection("usageDailySummaries").doc(summaryId.replaceAll("/", "_")),
      {
        summaryId,
        dateKey: asNonEmptyString(summary.dateKey),
        ownerId,
        ownerName: asNonEmptyString(summary.ownerName, ownerName),
        agent: asNonEmptyString(summary.agent, agent),
        events: asNumber(summary.events),
        sessions: asNumber(summary.sessions),
        inputTokens: asNumber(summary.inputTokens),
        cachedTokens: asNumber(summary.cachedTokens),
        cacheCreationTokens: asNumber(summary.cacheCreationTokens),
        outputTokens: asNumber(summary.outputTokens),
        reasoningTokens: asNumber(summary.reasoningTokens),
        totalTokens: asNumber(summary.totalTokens),
        lastCompletedAt: parseIsoTimestamp(summary.lastCompletedAt, now),
        source: asNonEmptyString(summary.source, "daily-agent-summary"),
        syncedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    summaryWrites += 1;
  }

  await batch.commit();

  return NextResponse.json({
    ok: true,
    ownerId,
    summaryWrites,
  });
}
