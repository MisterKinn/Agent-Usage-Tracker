"use client";

import Link from "next/link";
import { ArrowRight, Check, Copy, PlayCircle, Terminal, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import styles from "./guide.module.css";

const MAC_INSTALL_COMMAND =
    "/usr/bin/curl -fsSL 'https://agent-usage-tracker.vercel.app/api/install/python' | python3";
const WINDOWS_INSTALL_COMMAND =
    "powershell -NoProfile -ExecutionPolicy Bypass -Command \"& ([scriptblock]::Create((irm 'https://agent-usage-tracker.vercel.app/api/install/windows')))\"";
const MAC_RERUN_COMMAND =
    'cd ".agent-usage-tracker" && python3 track_agent_usage.py';
const WINDOWS_RERUN_COMMAND =
    "cd .agent-usage-tracker && py -3 track_agent_usage.py";

type OsKind = "windows" | "macos";

function detectOs(): OsKind {
    const userAgent = navigator.userAgent.toLowerCase();
    const platform = navigator.platform.toLowerCase();

    if (userAgent.includes("windows") || platform.includes("win")) {
        return "windows";
    }

    return "macos";
}

export default function GuidePage() {
    const [os, setOs] = useState<OsKind>("macos");
    const [copied, setCopied] = useState<"install" | "rerun" | null>(null);

    useEffect(() => {
        setOs(detectOs());
    }, []);

    const isWindows = os === "windows";
    const installCommand = isWindows
        ? WINDOWS_INSTALL_COMMAND
        : MAC_INSTALL_COMMAND;
    const rerunCommand = isWindows ? WINDOWS_RERUN_COMMAND : MAC_RERUN_COMMAND;
    const osLabel = isWindows ? "Windows" : "macOS / Linux";

    async function copyCommand(kind: "install" | "rerun") {
        const command = kind === "install" ? installCommand : rerunCommand;
        await navigator.clipboard.writeText(command);
        setCopied(kind);
        window.setTimeout(() => {
            setCopied((current) => (current === kind ? null : current));
        }, 1600);
    }

    return (
        <main className="page">
            <section className="section-heading">
                <p className="eyebrow">Guide</p>
                <h1>설명서</h1>
                <p>
                    VSCode 터미널에서 첫 설치 명령어 한 번, 그 다음부터는 재실행
                    명령어만 입력하면 됩니다.
                </p>
            </section>

            <section className={styles.guideGrid}>
                <article className={`feature-card ${styles.guideCard}`}>
                    <Terminal size={22} />
                    <h2>처음 1회 설치</h2>
                    <p>{osLabel} 기준 설치 명령어입니다. 이 명령어를 실행하면 로컬 프로젝트에 최소 트래커가 내려받아집니다.</p>
                    <div className={`copy-command ${styles.guideCommand}`}>
                        <code>{installCommand}</code>
                        <button
                            className={`copy-command-button${copied === "install" ? " is-copied" : ""}`}
                            type="button"
                            onClick={() => copyCommand("install")}
                        >
                            {copied === "install" ? <Check size={16} /> : <Copy size={16} />}
                            {copied === "install" ? "복사됨" : "복사"}
                        </button>
                    </div>
                </article>

                <article className={`feature-card ${styles.guideCard}`}>
                    <RotateCcw size={22} />
                    <h2>다시 실행</h2>
                    <p>이후에는 설치를 다시 할 필요 없이 아래 명령어로 워처만 재시작하면 됩니다.</p>
                    <div className={`copy-command ${styles.guideCommand}`}>
                        <code>{rerunCommand}</code>
                        <button
                            className={`copy-command-button${copied === "rerun" ? " is-copied" : ""}`}
                            type="button"
                            onClick={() => copyCommand("rerun")}
                        >
                            {copied === "rerun" ? <Check size={16} /> : <Copy size={16} />}
                            {copied === "rerun" ? "복사됨" : "복사"}
                        </button>
                    </div>
                </article>
            </section>

            <section className={styles.guideSteps}>
                <article className="feature-card">
                    <PlayCircle size={22} />
                    <h2>사용 순서</h2>
                    <p>1. 작업 중인 프로젝트에서 VSCode 터미널을 엽니다.</p>
                    <p>2. 위 설치 명령어를 한 번 실행하고 이름을 입력합니다.</p>
                    <p>3. 다음부터는 재실행 명령어만 입력해 워처를 켭니다.</p>
                </article>
                <article className="feature-card">
                    <ArrowRight size={22} />
                    <h2>확인 방법</h2>
                    <p>워처가 실행되면 Codex와 Claude Code 로그를 읽어서 Firebase에 일자 집계를 올립니다.</p>
                    <p>그 다음 대시보드에서 사용자별 active token 흐름과 순위를 확인하면 됩니다.</p>
                    <div className="page-actions">
                        <Link className="button" href="/dashboard">
                            대시보드 열기
                        </Link>
                    </div>
                </article>
            </section>
        </main>
    );
}
