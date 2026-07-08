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
        const trackerSnapshot = await getDocsByOwnerId("trackerClients", ownerId);
        const batch = adminDb().batch();

        usageSnapshot.docs.forEach((item) =>
            batch.update(item.ref, { ownerName }),
        );
        trackerSnapshot.docs.forEach((item) =>
            batch.update(item.ref, { ownerName }),
        );
        await batch.commit();

        return NextResponse.json({
            ok: true,
            ownerId,
            ownerName,
            updatedTrackerDocs: trackerSnapshot.size,
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
        const deletedTracker = await deleteDocsByOwnerId("trackerClients", ownerId);

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
