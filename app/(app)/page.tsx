"use client";

import Link from "next/link";
import { ArrowRight, BarChart3, Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import {
    detectOsFromNavigator,
    installCommandFor,
    type OsKind,
} from "@/lib/install-commands";

export default function Home() {
    const [os, setOs] = useState<OsKind>("macos");
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        setOs(detectOsFromNavigator());
    }, []);

    useEffect(() => {
        document.body.classList.add("home-landing");

        return () => {
            document.body.classList.remove("home-landing");
        };
    }, []);

    const isWindows = os === "windows";
    const command = installCommandFor(os);
    const osLabel = isWindows ? "Windows" : "macOS / Linux";
    const title = isWindows ? "PowerShell 설치" : "터미널 설치";

    async function copyCommand() {
        await navigator.clipboard.writeText(command);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
    }

    return (
        <main className="dark-home">
            <section className="landing-hero">
                <div className="landing-copy">
                    <p className="eyebrow">Real-time Agent Usage Tracking</p>
                    <h1>Agent Usage Tracker</h1>
                    <p>AI 에이전트의 토큰 사용량을 실시간으로 추적합니다.</p>
                </div>

                <div className="install-console" aria-label="install commands">
                    <article className="command-card featured">
                        <div>
                            <span>{osLabel}</span>
                            <h2>{title}</h2>
                        </div>
                        <div className="copy-command">
                            <code>{command}</code>
                            <button
                                className={`copy-command-button${copied ? " is-copied" : ""}`}
                                type="button"
                                onClick={copyCommand}
                            >
                                {copied ? (
                                    <Check size={16} />
                                ) : (
                                    <Copy size={16} />
                                )}
                                {copied ? "복사됨" : "복사"}
                            </button>
                        </div>
                    </article>
                </div>

                <div className="hero-actions">
                    <Link className="button" href="/dashboard">
                        <BarChart3 size={18} />
                        대시보드 보기
                    </Link>
                    <Link className="button secondary" href="/login">
                        로그인/회원가입
                        <ArrowRight size={18} />
                    </Link>
                </div>
            </section>
        </main>
    );
}
