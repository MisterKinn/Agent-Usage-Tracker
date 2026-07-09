import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import {
    adminAuth,
    adminDb,
    adminStorage,
    adminStorageBucketName,
} from "@/lib/firebase-admin";

function env(name: string) {
    return process.env[name]?.trim();
}

function jsonError(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

function readableUploadError(error: unknown) {
    const message =
        error instanceof Error ? error.message : "문의를 저장하지 못했습니다.";

    if (
        message.includes("The specified bucket does not exist") ||
        message.includes("Bucket name not specified or invalid")
    ) {
        return "Firebase Storage 버킷이 아직 준비되지 않았습니다. Firebase Console > Storage에서 버킷을 생성하고, Vercel/로컬 환경변수의 FIREBASE_ADMIN_STORAGE_BUCKET에 실제 버킷명을 넣어 주세요.";
    }

    return message;
}

export async function POST(request: Request) {
    try {
        const authorization = request.headers.get("authorization") ?? "";
        const token = authorization.startsWith("Bearer ")
            ? authorization.slice("Bearer ".length).trim()
            : "";

        if (!token) {
            return jsonError("로그인이 필요합니다.", 401);
        }

        const decoded = await adminAuth().verifyIdToken(token);
        const formData = await request.formData();
        const subject = String(formData.get("subject") ?? "").trim();
        const message = String(formData.get("message") ?? "").trim();
        const ownerName = String(formData.get("ownerName") ?? "").trim();
        const os = String(formData.get("os") ?? "").trim();
        const browser = String(formData.get("browser") ?? "").trim();
        const deviceType = String(formData.get("deviceType") ?? "").trim();
        const files = formData
            .getAll("attachments")
            .filter((item): item is File => item instanceof File && item.size > 0)
            .slice(0, 5);

        if (!subject || !message) {
            return jsonError("제목과 문의 내용을 입력해 주세요.", 400);
        }

        const messageRef = adminDb().collection("contactMessages").doc();
        const storageBucket = adminStorage().bucket(adminStorageBucketName());

        const attachments = await Promise.all(
            files.map(async (file) => {
                const buffer = Buffer.from(await file.arrayBuffer());
                const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
                const storagePath = [
                    "contact-attachments",
                    decoded.uid,
                    messageRef.id,
                    `${Date.now()}-${safeName}`,
                ].join("/");
                const bucketFile = storageBucket.file(storagePath);

                await bucketFile.save(buffer, {
                    contentType: file.type || "application/octet-stream",
                    resumable: false,
                    metadata: {
                        cacheControl: "private, max-age=31536000",
                        contentDisposition: `attachment; filename="${encodeURIComponent(file.name)}"`,
                    },
                });

                const [url] = await bucketFile.getSignedUrl({
                    action: "read",
                    expires: "2099-12-31",
                });

                return {
                    content: buffer.toString("base64"),
                    filename: file.name,
                    path: storagePath,
                    size: file.size,
                    type: file.type || "application/octet-stream",
                    url,
                };
            }),
        );

        await messageRef.set({
            attachments: attachments.map((item) => ({
                name: item.filename,
                path: item.path,
                size: item.size,
                type: item.type,
                url: item.url,
            })),
            authEmail: decoded.email ?? "",
            authUid: decoded.uid,
            browser,
            createdAt: FieldValue.serverTimestamp(),
            deviceType,
            message,
            os,
            ownerName,
            status: "new",
            subject,
        });

        const resendKey = env("RESEND_API_KEY");
        const resendFrom = env("RESEND_FROM_EMAIL");
        const adminEmail = env("ADMIN_ALERT_EMAIL") ?? "ksy535760@gmail.com";

        if (resendKey && resendFrom) {
            const resendResponse = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${resendKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    from: resendFrom,
                    to: [adminEmail],
                    subject: `[Agent Usage Tracker] ${subject}`,
                    html: `
                        <div style="font-family:Arial,sans-serif;line-height:1.6">
                            <h2>새 문의가 도착했습니다</h2>
                            <p><strong>이름:</strong> ${ownerName || "unknown"}</p>
                            <p><strong>이메일:</strong> ${decoded.email ?? "unknown"}</p>
                            <p><strong>환경:</strong> ${os || "unknown"} / ${browser || "unknown"} / ${deviceType || "unknown"}</p>
                            <p><strong>메시지 ID:</strong> ${messageRef.id}</p>
                            <p><strong>제목:</strong> ${subject}</p>
                            <p><strong>내용:</strong></p>
                            <pre style="white-space:pre-wrap">${message}</pre>
                        </div>
                    `,
                    attachments: attachments.map((item) => ({
                        content: item.content,
                        filename: item.filename,
                    })),
                }),
            });

            if (!resendResponse.ok) {
                const errorText = await resendResponse.text();
                console.warn("contact email failed:", errorText);
            }
        }

        return NextResponse.json({
            id: messageRef.id,
            ok: true,
        });
    } catch (error) {
        return jsonError(readableUploadError(error), 400);
    }
}
