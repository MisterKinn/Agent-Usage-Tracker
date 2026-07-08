import { adminAuth } from "@/lib/firebase-admin";
import { ADMIN_EMAILS } from "@/lib/admin";

export async function requireAdmin(request: Request) {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length).trim()
        : "";

    if (!token) {
        throw new Error("Missing admin token.");
    }

    const decoded = await adminAuth().verifyIdToken(token);
    const email = String(decoded.email ?? "").trim().toLowerCase();

    if (!ADMIN_EMAILS.includes(email as (typeof ADMIN_EMAILS)[number])) {
        throw new Error("Admin permission required.");
    }

    return decoded;
}
