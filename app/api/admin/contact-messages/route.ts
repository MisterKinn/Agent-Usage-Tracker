import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/admin-server";

function jsonError(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

export async function PATCH(request: Request) {
    try {
        await requireAdmin(request);
        const body = (await request.json()) as {
            ids?: string[];
            status?: string;
        };
        const ids = Array.isArray(body.ids)
            ? body.ids.map((item) => String(item).trim()).filter(Boolean)
            : [];
        const status = String(body.status ?? "").trim();

        if (!ids.length || !status) {
            return jsonError("ids and status are required.", 400);
        }

        const batch = adminDb().batch();
        ids.forEach((id) =>
            batch.update(adminDb().collection("contactMessages").doc(id), {
                status,
            }),
        );
        await batch.commit();

        return NextResponse.json({
            ok: true,
            status,
            updated: ids.length,
        });
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : "Failed to update contact messages.";
        return jsonError(message, 400);
    }
}

export async function DELETE(request: Request) {
    try {
        await requireAdmin(request);
        const body = (await request.json()) as {
            id?: string;
            ids?: string[];
        };
        const ids = Array.isArray(body.ids)
            ? body.ids.map((item) => String(item).trim()).filter(Boolean)
            : [];
        const singleId = String(body.id ?? "").trim();
        const targetIds = ids.length ? ids : singleId ? [singleId] : [];

        if (!targetIds.length) {
            return jsonError("message id is required.", 400);
        }

        const db = adminDb();
        const refs = targetIds.map((id) =>
            db.collection("contactMessages").doc(id),
        );
        const snapshots = await db.getAll(...refs);
        const invalid = snapshots.find((snapshot) => !snapshot.exists);
        if (invalid) {
            return jsonError("문의를 찾을 수 없습니다.", 404);
        }

        const unresolved = snapshots.find(
            (snapshot) => String(snapshot.get("status") ?? "") !== "resolved",
        );
        if (unresolved) {
            return jsonError("resolved 문의만 삭제할 수 있습니다.", 400);
        }

        const batch = db.batch();
        refs.forEach((ref) => batch.delete(ref));
        await batch.commit();

        return NextResponse.json({
            ok: true,
            deleted: targetIds.length,
            ids: targetIds,
        });
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : "Failed to delete contact message.";
        return jsonError(message, 400);
    }
}
