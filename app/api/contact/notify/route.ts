import { NextResponse } from "next/server";

function env(name: string) {
    return process.env[name]?.trim();
}

export async function POST(request: Request) {
    const resendKey = env("RESEND_API_KEY");
    const resendFrom = env("RESEND_FROM_EMAIL");
    const adminEmail = env("ADMIN_ALERT_EMAIL") ?? "ksy535760@gmail.com";

    if (!resendKey || !resendFrom) {
        return NextResponse.json(
            { error: "Resend env is not configured." },
            { status: 503 },
        );
    }

    const body = (await request.json()) as {
        authEmail?: string;
        attachments?: Array<{ name?: string; url?: string }>;
        message?: string;
        messageId?: string;
        os?: string;
        ownerName?: string;
        subject?: string;
    };

    const subject = body.subject?.trim() || "새 문의";
    const ownerName = body.ownerName?.trim() || "unknown";
    const authEmail = body.authEmail?.trim() || "unknown";
    const os = body.os?.trim() || "unknown";
    const message = body.message?.trim() || "";
    const messageId = body.messageId?.trim() || "unknown";
    const attachments = Array.isArray(body.attachments)
        ? body.attachments.filter((item) => item?.name || item?.url)
        : [];
    const attachmentHtml = attachments.length
        ? `<p><strong>첨부:</strong></p><ul>${attachments
              .map((item) => {
                  const name = item.name?.trim() || "attachment";
                  const url = item.url?.trim() || "";
                  return url
                      ? `<li><a href="${url}">${name}</a></li>`
                      : `<li>${name}</li>`;
              })
              .join("")}</ul>`
        : "";

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
                    <p><strong>이름:</strong> ${ownerName}</p>
                    <p><strong>이메일:</strong> ${authEmail}</p>
                    <p><strong>환경:</strong> ${os}</p>
                    <p><strong>메시지 ID:</strong> ${messageId}</p>
                    <p><strong>제목:</strong> ${subject}</p>
                    ${attachmentHtml}
                    <p><strong>내용:</strong></p>
                    <pre style="white-space:pre-wrap">${message}</pre>
                </div>
            `,
        }),
    });

    if (!resendResponse.ok) {
        const errorText = await resendResponse.text();
        return NextResponse.json(
            { error: errorText || "Failed to send email." },
            { status: 502 },
        );
    }

    return NextResponse.json({ ok: true });
}
