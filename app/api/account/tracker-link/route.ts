import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

function jsonError(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

function asNonEmptyString(value: unknown, fallback = "") {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

async function requireUser(request: Request) {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length).trim()
        : "";

    if (!token) {
        throw new Error("Missing auth token.");
    }

    return adminAuth().verifyIdToken(token);
}

export async function GET(request: Request) {
    try {
        const decoded = await requireUser(request);
        const profileSnapshot = await adminDb()
            .collection("userProfiles")
            .doc(decoded.uid)
            .get();

        return NextResponse.json({
            ok: true,
            linkedOwnerId: asNonEmptyString(profileSnapshot.get("linkedOwnerId")),
            linkedOwnerName: asNonEmptyString(
                profileSnapshot.get("linkedOwnerName"),
            ),
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unauthorized";
        return jsonError(message, 401);
    }
}

export async function POST(request: Request) {
    try {
        const decoded = await requireUser(request);
        const body = (await request.json()) as { ownerId?: string };
        const ownerId = asNonEmptyString(body.ownerId);
        if (!ownerId) {
            return jsonError("ownerId is required.", 400);
        }

        const db = adminDb();
        const trackerRef = db.collection("trackerClients").doc(ownerId);
        const trackerSnapshot = await trackerRef.get();
        const usageSnapshot = await db
            .collection("usageDailySummaries")
            .where("ownerId", "==", ownerId)
            .limit(2000)
            .get();

        if (!trackerSnapshot.exists && usageSnapshot.empty) {
            return jsonError("해당 ownerId를 찾을 수 없습니다.", 404);
        }

        const existingAuthUid = asNonEmptyString(trackerSnapshot.get("authUid"));
        if (existingAuthUid && existingAuthUid !== decoded.uid) {
            return jsonError("이미 다른 계정에 연결된 tracker owner입니다.", 409);
        }

        const ownerName = asNonEmptyString(
            trackerSnapshot.get("ownerName"),
            asNonEmptyString(usageSnapshot.docs[0]?.get("ownerName"), "unknown"),
        );
        const authEmail = asNonEmptyString(decoded.email);

        const batch = db.batch();
        batch.set(
            db.collection("userProfiles").doc(decoded.uid),
            {
                authUid: decoded.uid,
                authEmail,
                displayName: asNonEmptyString(decoded.name),
                linkedOwnerId: ownerId,
                linkedOwnerName: ownerName,
            },
            { merge: true },
        );
        batch.set(
            trackerRef,
            {
                ownerId,
                ownerName,
                authUid: decoded.uid,
                authEmail,
                linkedAt: new Date().toISOString(),
            },
            { merge: true },
        );
        usageSnapshot.docs.forEach((doc) =>
            batch.set(
                doc.ref,
                {
                    authUid: decoded.uid,
                    authEmail,
                },
                { merge: true },
            ),
        );
        await batch.commit();

        return NextResponse.json({
            ok: true,
            linkedOwnerId: ownerId,
            linkedOwnerName: ownerName,
            updatedUsageDocs: usageSnapshot.size,
        });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Failed to link tracker.";
        return jsonError(message, 400);
    }
}

export async function DELETE(request: Request) {
    try {
        const decoded = await requireUser(request);
        const db = adminDb();
        const profileRef = db.collection("userProfiles").doc(decoded.uid);
        const profileSnapshot = await profileRef.get();
        const linkedOwnerId = asNonEmptyString(profileSnapshot.get("linkedOwnerId"));

        if (!linkedOwnerId) {
            return NextResponse.json({ ok: true, unlinked: false });
        }

        const trackerRef = db.collection("trackerClients").doc(linkedOwnerId);
        const trackerSnapshot = await trackerRef.get();
        const trackerAuthUid = asNonEmptyString(trackerSnapshot.get("authUid"));
        if (trackerAuthUid && trackerAuthUid !== decoded.uid) {
            return jsonError("다른 계정과 연결된 tracker owner입니다.", 409);
        }

        const usageSnapshot = await db
            .collection("usageDailySummaries")
            .where("ownerId", "==", linkedOwnerId)
            .limit(2000)
            .get();

        const batch = db.batch();
        batch.set(
            profileRef,
            {
                linkedOwnerId: "",
                linkedOwnerName: "",
            },
            { merge: true },
        );
        batch.set(
            trackerRef,
            {
                authUid: "",
                authEmail: "",
            },
            { merge: true },
        );
        usageSnapshot.docs.forEach((doc) =>
            batch.set(
                doc.ref,
                {
                    authUid: "",
                    authEmail: "",
                },
                { merge: true },
            ),
        );
        await batch.commit();

        return NextResponse.json({
            ok: true,
            unlinked: true,
            updatedUsageDocs: usageSnapshot.size,
        });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Failed to unlink tracker.";
        return jsonError(message, 400);
    }
}
