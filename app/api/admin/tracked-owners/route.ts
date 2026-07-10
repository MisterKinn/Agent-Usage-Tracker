import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/admin-server";

function jsonError(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

async function getRefsByOwner(
    collectionName: string,
    ownerId: string,
    ownerName: string,
) {
    const refs = new Map<string, FirebaseFirestore.DocumentReference>();
    const collectionRef = adminDb().collection(collectionName);

    if (ownerId) {
        const byOwnerId = await collectionRef
            .where("ownerId", "==", ownerId)
            .limit(500)
            .get();
        byOwnerId.docs.forEach((item) => refs.set(item.ref.path, item.ref));
    }

    if (ownerName) {
        const byOwnerName = await collectionRef
            .where("ownerName", "==", ownerName)
            .limit(500)
            .get();
        byOwnerName.docs.forEach((item) => refs.set(item.ref.path, item.ref));
    }

    return Array.from(refs.values());
}

async function getTrackerRefs(ownerId: string, ownerName: string) {
    const refs = new Map<string, FirebaseFirestore.DocumentReference>();
    const collectionRef = adminDb().collection("trackerClients");

    if (ownerId) {
        const byOwnerId = await collectionRef
            .where("ownerId", "==", ownerId)
            .limit(500)
            .get();
        byOwnerId.docs.forEach((item) => refs.set(item.ref.path, item.ref));
    }

    if (ownerName) {
        const byOwnerName = await collectionRef
            .where("ownerName", "==", ownerName)
            .limit(500)
            .get();
        byOwnerName.docs.forEach((item) => refs.set(item.ref.path, item.ref));
    }

    const directRef = collectionRef.doc(ownerId);
    const directDoc = await directRef.get();
    if (directDoc.exists) {
        refs.set(directRef.path, directRef);
    }

    return Array.from(refs.values());
}

export async function PATCH(request: Request) {
    try {
        await requireAdmin(request);
        const body = (await request.json()) as {
            clearLinkedAuth?: boolean;
            ownerId?: string;
            ownerName?: string;
            previousOwnerName?: string;
        };
        const ownerId = String(body.ownerId ?? "").trim();
        const ownerName = String(body.ownerName ?? "").trim();
        const previousOwnerName = String(
            body.previousOwnerName ?? "",
        ).trim();
        const clearLinkedAuth = Boolean(body.clearLinkedAuth);

        if (!ownerId) {
            return jsonError("ownerId is required.", 400);
        }

        const usageRefs = await getRefsByOwner(
            "usageDailySummaries",
            ownerId,
            previousOwnerName || ownerName,
        );
        const trackerRefs = await getTrackerRefs(
            ownerId,
            previousOwnerName || ownerName,
        );
        const batch = adminDb().batch();

        if (clearLinkedAuth) {
            usageRefs.forEach((ref) =>
                batch.update(ref, { authUid: "", authEmail: "" }),
            );
            trackerRefs.forEach((ref) =>
                batch.update(ref, { authUid: "", authEmail: "" }),
            );
        } else {
            if (!ownerName) {
                return jsonError("ownerName is required.", 400);
            }
            usageRefs.forEach((ref) => batch.update(ref, { ownerName }));
            trackerRefs.forEach((ref) =>
                batch.update(ref, { ownerName }),
            );
        }
        await batch.commit();

        return NextResponse.json({
            ok: true,
            ownerId,
            ownerName,
            clearedLinkedAuth: clearLinkedAuth,
            updatedTrackerDocs: trackerRefs.length,
            updatedUsageDocs: usageRefs.length,
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
            ownerName?: string;
        };
        const ownerId = String(body.ownerId ?? "").trim();
        const ownerName = String(body.ownerName ?? "").trim();

        if (!ownerId) {
            return jsonError("ownerId is required.", 400);
        }

        const usageRefs = await getRefsByOwner(
            "usageDailySummaries",
            ownerId,
            ownerName,
        );
        if (usageRefs.length) {
            const batch = adminDb().batch();
            usageRefs.forEach((ref) => batch.delete(ref));
            await batch.commit();
        }
        const deletedUsage = usageRefs.length;

        const trackerRefs = await getTrackerRefs(ownerId, ownerName);
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
