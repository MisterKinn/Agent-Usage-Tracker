import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/admin-server";

function jsonError(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

export async function DELETE(request: Request) {
    try {
        await requireAdmin(request);
        const body = (await request.json()) as {
            id?: string;
        };
        const id = String(body.id ?? "").trim();

        if (!id) {
            return jsonError("message id is required.", 400);
        }

        const docRef = adminDb().collection("contactMessages").doc(id);
        const snapshot = await docRef.get();

        if (!snapshot.exists) {
            return jsonError("문의를 찾을 수 없습니다.", 404);
        }

        const status = String(snapshot.get("status") ?? "");
        if (status !== "resolved") {
            return jsonError("resolved 문의만 삭제할 수 있습니다.", 400);
        }

        await docRef.delete();

        return NextResponse.json({
            id,
            ok: true,
        });
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : "Failed to delete contact message.";
        return jsonError(message, 400);
    }
}
