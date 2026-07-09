import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function asNonEmptyString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

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

    const body = (await request.json()) as {
      ownerId?: string;
      ownerName?: string;
    };
    const ownerId = asNonEmptyString(body.ownerId);
    const ownerName = asNonEmptyString(body.ownerName);

    if (!ownerId || !ownerName) {
      return jsonError("ownerId and ownerName are required.", 400);
    }

    const db = adminDb();
    const usageSnapshot = await db
      .collection("usageDailySummaries")
      .where("ownerId", "==", ownerId)
      .limit(2000)
      .get();

    const batch = db.batch();
    usageSnapshot.docs.forEach((doc) => batch.update(doc.ref, { ownerName }));
    batch.set(
      db.collection("trackerClients").doc(ownerId),
      {
        ownerId,
        ownerName,
      },
      { merge: true },
    );
    await batch.commit();

    return NextResponse.json({
      ok: true,
      ownerId,
      ownerName,
      updatedUsageDocs: usageSnapshot.size,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to sync owner profile.";
    return jsonError(message, 500);
  }
}
