import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/admin-server";

function jsonError(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

async function getDocsByOwnerId(collectionName: string, ownerId: string) {
    return adminDb()
        .collection(collectionName)
        .where("ownerId", "==", ownerId)
        .limit(500)
        .get();
}

async function getTrackerRefs(ownerId: string) {
    const refs = new Map<string, FirebaseFirestore.DocumentReference>();
    const collectionRef = adminDb().collection("trackerClients");

    const byField = await collectionRef.where("ownerId", "==", ownerId).limit(500).get();
    byField.docs.forEach((item) => refs.set(item.ref.path, item.ref));

    const directRef = collectionRef.doc(ownerId);
    const directDoc = await directRef.get();
    if (directDoc.exists) {
        refs.set(directRef.path, directRef);
    }

    return Array.from(refs.values());
}

async function deleteDocsByOwnerId(collectionName: string, ownerId: string) {
    let deleted = 0;

    while (true) {
        const snapshot = await adminDb()
            .collection(collectionName)
            .where("ownerId", "==", ownerId)
            .limit(200)
            .get();

        if (snapshot.empty) {
            break;
        }

        const batch = adminDb().batch();
        snapshot.docs.forEach((item) => batch.delete(item.ref));
        await batch.commit();
        deleted += snapshot.size;
    }

    return deleted;
}

export async function PATCH(request: Request) {
    try {
        await requireAdmin(request);
        const body = (await request.json()) as {
            ownerId?: string;
            ownerName?: string;
        };
        const ownerId = String(body.ownerId ?? "").trim();
        const ownerName = String(body.ownerName ?? "").trim();

        if (!ownerId || !ownerName) {
            return jsonError("ownerId and ownerName are required.", 400);
        }

        const usageSnapshot = await getDocsByOwnerId("usageDailySummaries", ownerId);
        const trackerRefs = await getTrackerRefs(ownerId);
        const batch = adminDb().batch();

        usageSnapshot.docs.forEach((item) =>
            batch.update(item.ref, { ownerName }),
        );
        trackerRefs.forEach((ref) =>
            batch.update(ref, { ownerName }),
        );
        await batch.commit();

        return NextResponse.json({
            ok: true,
            ownerId,
            ownerName,
            updatedTrackerDocs: trackerRefs.length,
            updatedUsageDocs: usageSnapshot.size,
        });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Failed to update owner.";
        return jsonError(message, 400);
    }
}

export async function DELETE(request: Request) {
    try {
        await requireAdmin(request);
        const body = (await request.json()) as {
            ownerId?: string;
        };
        const ownerId = String(body.ownerId ?? "").trim();

        if (!ownerId) {
            return jsonError("ownerId is required.", 400);
        }

        const deletedUsage = await deleteDocsByOwnerId("usageDailySummaries", ownerId);
        const trackerRefs = await getTrackerRefs(ownerId);
        if (trackerRefs.length) {
            const batch = adminDb().batch();
            trackerRefs.forEach((ref) => batch.delete(ref));
            await batch.commit();
        }
        const deletedTracker = trackerRefs.length;

        return NextResponse.json({
            ok: true,
            deletedTracker,
            deletedUsage,
            ownerId,
        });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Failed to delete owner.";
        return jsonError(message, 400);
    }
}
