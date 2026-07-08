import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Agent Usage Tracker",
    description:
        "Realtime Codex and Claude Code usage tracking for shared teams.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="ko">
            <body>{children}</body>
        </html>
    );
}
