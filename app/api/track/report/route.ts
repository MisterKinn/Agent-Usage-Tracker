import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

const DASHBOARD_TIMEZONE = "Asia/Seoul";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function asNonEmptyString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function dashboardDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DASHBOARD_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function recentDateKeys(days: number) {
  return Array.from({ length: days }, (_, index) => {
    const offset = days - 1 - index;
    const date = new Date(Date.now() - offset * 24 * 60 * 60 * 1000);
    return dashboardDateKey(date);
  });
}

type TrackerReportBody = {
  days?: number;
  ownerId?: string;
};

export async function POST(request: Request) {
  try {
    const expectedToken = process.env.TRACKER_WRITE_TOKEN?.trim();
    if (!expectedToken) {
      return jsonError("TRACKER_WRITE_TOKEN is not configured.", 503);
    }

    const authorization = request.headers.get("authorization") ?? "";
    if (authorization !== `Bearer ${expectedToken}`) {
      return jsonError("Unauthorized tracker request.", 401);
    }

    const body = (await request.json()) as TrackerReportBody;
    const ownerId = asNonEmptyString(body.ownerId);
    const days = Math.max(0, Math.floor(asNumber(body.days) || 7));

    if (!ownerId) {
      return jsonError("ownerId is required.", 400);
    }

    const db = adminDb();
    const usageSnapshot = await db
      .collection("usageDailySummaries")
      .where("ownerId", "==", ownerId)
      .limit(2000)
      .get();

    const trackerSnapshot = await db.collection("trackerClients").doc(ownerId).get();
    const ownerName = asNonEmptyString(
      trackerSnapshot.get("ownerName"),
      asNonEmptyString(usageSnapshot.docs[0]?.get("ownerName"), "unknown"),
    );

    const allowedDateKeys = days > 0 ? new Set(recentDateKeys(days)) : null;
    const daily = usageSnapshot.docs
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          dateKey: asNonEmptyString(data.dateKey),
          agent: asNonEmptyString(data.agent, "unknown"),
          ownerId: asNonEmptyString(data.ownerId),
          ownerName: asNonEmptyString(data.ownerName, ownerName),
          events: asNumber(data.events),
          sessions: asNumber(data.sessions),
          inputTokens: asNumber(data.inputTokens),
          cachedTokens: asNumber(data.cachedTokens),
          cacheCreationTokens: asNumber(data.cacheCreationTokens),
          outputTokens: asNumber(data.outputTokens),
          reasoningTokens: asNumber(data.reasoningTokens),
          totalTokens: asNumber(data.totalTokens),
          activeTokens: Math.max(
            asNumber(data.totalTokens) - asNumber(data.cachedTokens),
            0,
          ),
          source: asNonEmptyString(data.source, "daily-agent-summary"),
        };
      })
      .filter((item) => (allowedDateKeys ? allowedDateKeys.has(item.dateKey) : true))
      .sort((a, b) => {
        if (a.dateKey === b.dateKey) {
          return a.agent.localeCompare(b.agent);
        }
        return b.dateKey.localeCompare(a.dateKey);
      });

    const totals = daily.reduce(
      (acc, item) => {
        acc.events += item.events;
        acc.sessions += item.sessions;
        acc.inputTokens += item.inputTokens;
        acc.cachedTokens += item.cachedTokens;
        acc.cacheCreationTokens += item.cacheCreationTokens;
        acc.outputTokens += item.outputTokens;
        acc.reasoningTokens += item.reasoningTokens;
        acc.totalTokens += item.totalTokens;
        acc.activeTokens += item.activeTokens;
        return acc;
      },
      {
        events: 0,
        sessions: 0,
        inputTokens: 0,
        cachedTokens: 0,
        cacheCreationTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
        activeTokens: 0,
      },
    );

    const agentTotals = Array.from(
      daily.reduce((acc, item) => {
        const current =
          acc.get(item.agent) ?? {
            agent: item.agent,
            activeTokens: 0,
            totalTokens: 0,
            events: 0,
            sessions: 0,
          };
        current.activeTokens += item.activeTokens;
        current.totalTokens += item.totalTokens;
        current.events += item.events;
        current.sessions += item.sessions;
        acc.set(item.agent, current);
        return acc;
      }, new Map<string, { agent: string; activeTokens: number; totalTokens: number; events: number; sessions: number }>())
        .values(),
    ).sort((a, b) => b.activeTokens - a.activeTokens);

    return NextResponse.json({
      ok: true,
      ownerId,
      ownerName,
      periodDays: days,
      totals,
      agentTotals,
      daily,
      trackerClient: {
        lastSeenAt: trackerSnapshot.get("lastSeenAt")?.toDate?.()?.toISOString?.() ?? null,
        lastWorkspacePath: asNonEmptyString(trackerSnapshot.get("lastWorkspacePath")),
        source: asNonEmptyString(trackerSnapshot.get("source")),
        trackerPath: asNonEmptyString(trackerSnapshot.get("trackerPath")),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load tracker report.";
    return jsonError(message, 500);
  }
}
