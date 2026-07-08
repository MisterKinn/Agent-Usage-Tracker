import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/admin-server";

function jsonError(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

async function deleteMatchingDocs(
    collectionName: string,
    field: string,
    value: string,
) {
    const db = adminDb();
    let deleted = 0;

    while (true) {
        const snapshot = await db
            .collection(collectionName)
            .where(field, "==", value)
            .limit(200)
            .get();

        if (snapshot.empty) {
            break;
        }

        const batch = db.batch();
        snapshot.docs.forEach((item) => batch.delete(item.ref));
        await batch.commit();
        deleted += snapshot.size;
    }

    return deleted;
}

export async function GET(request: Request) {
    try {
        await requireAdmin(request);

        const result = await adminAuth().listUsers(1000);
        const users = result.users.map((item) => ({
            uid: item.uid,
            email: item.email ?? "",
            displayName: item.displayName ?? "",
            disabled: item.disabled,
            providerIds: item.providerData.map((provider) => provider.providerId),
            creationTime: item.metadata.creationTime ?? "",
            lastSignInTime: item.metadata.lastSignInTime ?? "",
        }));

        return NextResponse.json({ users });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unauthorized";
        return jsonError(message, 401);
    }
}

export async function DELETE(request: Request) {
    try {
        await requireAdmin(request);
        const body = (await request.json()) as {
            cleanupOnly?: boolean;
            uid?: string;
        };
        const uid = String(body.uid ?? "").trim();

        if (!uid) {
            return jsonError("uid is required.", 400);
        }

        const userRecord = await adminAuth().getUser(uid);
        const deletedProfiles = await deleteMatchingDocs("userProfiles", "authUid", uid);
        const deletedVisits = await deleteMatchingDocs("visitorInsights", "authUid", uid);
        const deletedMessages = await deleteMatchingDocs("contactMessages", "authUid", uid);

        if (!body.cleanupOnly) {
            await adminAuth().deleteUser(uid);
        }

        return NextResponse.json({
            ok: true,
            deletedMessages,
            deletedProfiles,
            deletedVisits,
            email: userRecord.email ?? "",
            uid,
        });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Failed to delete user.";
        return jsonError(message, 400);
    }
}
