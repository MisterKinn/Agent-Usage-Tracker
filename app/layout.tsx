import type { Metadata } from "next";
import { SiteNav } from "./_components/site-nav";
import { VisitTracker } from "./_components/visit-tracker";
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
            <body>
                <SiteNav />
                <VisitTracker />
                <div className="site-nav-spacer" />
                {children}
            </body>
        </html>
    );
}
