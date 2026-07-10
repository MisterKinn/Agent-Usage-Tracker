import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/admin-server";

function jsonError(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

function asString(value: unknown, fallback = "") {
    return typeof value === "string" ? value.trim() : fallback;
}

export async function GET() {
    try {
        const snapshot = await adminDb().collection("siteConfig").doc("global").get();
        const banner = snapshot.get("banner") as
            | {
                  active?: boolean;
                  message?: string;
                  tone?: string;
              }
            | undefined;

        return NextResponse.json({
            active: Boolean(banner?.active && banner?.message),
            message: asString(banner?.message),
            tone: asString(banner?.tone, "neutral"),
        });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Failed to load banner.";
        return jsonError(message, 500);
    }
}

export async function PATCH(request: Request) {
    try {
        await requireAdmin(request);
        const body = (await request.json()) as {
            active?: boolean;
            message?: string;
            tone?: string;
        };
        const payload = {
            active: Boolean(body.active),
            message: asString(body.message),
            tone: asString(body.tone, "neutral"),
            updatedAt: new Date().toISOString(),
        };

        await adminDb()
            .collection("siteConfig")
            .doc("global")
            .set({ banner: payload }, { merge: true });

        return NextResponse.json({ ok: true, banner: payload });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Failed to update banner.";
        return jsonError(message, 400);
    }
}
