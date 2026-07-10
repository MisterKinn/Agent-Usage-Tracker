"use client";

import { AlertTriangle, Megaphone, Wrench } from "lucide-react";
import { useEffect, useState } from "react";

type BannerPayload = {
    active: boolean;
    message: string;
    tone: string;
};

function bannerIcon(tone: string) {
    if (tone === "warning") {
        return <AlertTriangle size={14} />;
    }
    if (tone === "maintenance") {
        return <Wrench size={14} />;
    }
    return <Megaphone size={14} />;
}

export function SiteBanner() {
    const [banner, setBanner] = useState<BannerPayload | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function loadBanner() {
            try {
                const response = await fetch("/api/site-banner", {
                    cache: "no-store",
                });
                if (!response.ok) {
                    return;
                }
                const payload = (await response.json()) as BannerPayload;
                if (!cancelled) {
                    setBanner(payload.active ? payload : null);
                }
            } catch {
                if (!cancelled) {
                    setBanner(null);
                }
            }
        }

        void loadBanner();
        const interval = window.setInterval(() => {
            void loadBanner();
        }, 60000);

        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, []);

    if (!banner?.active || !banner.message) {
        return null;
    }

    return (
        <>
            <div className="site-banner-spacer" />
            <div className={`site-banner ${banner.tone || "neutral"}`}>
                <div className="site-banner-inner">
                    {bannerIcon(banner.tone)}
                    <span>{banner.message}</span>
                </div>
            </div>
        </>
    );
}
