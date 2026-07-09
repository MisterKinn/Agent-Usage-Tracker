"use client";

import Link from "next/link";
import {
    ArrowRight,
    Check,
    Copy,
    PlayCircle,
    Terminal,
    RotateCcw,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
    detectOsFromNavigator,
    installCommandFor,
    renameCommandFor,
    reportCommandFor,
    rerunCommandFor,
    type OsKind,
} from "@/lib/install-commands";
import styles from "./guide.module.css";

export default function GuidePage() {
    const [os, setOs] = useState<OsKind>("macos");
    const [copied, setCopied] = useState<
        "install" | "rerun" | "rename" | "report" | null
    >(null);

    useEffect(() => {
        setOs(detectOsFromNavigator());
    }, []);

    const isWindows = os === "windows";
    const installCommand = installCommandFor(os);
    const rerunCommand = rerunCommandFor(os);
    const renameCommand = renameCommandFor(os);
    const reportCommand = reportCommandFor(os);
    const osLabel = isWindows ? "Windows" : "macOS / Linux";

    async function copyCommand(kind: "install" | "rerun" | "rename" | "report") {
        const command =
            kind === "install"
                ? installCommand
                : kind === "rerun"
                  ? rerunCommand
                  : kind === "rename"
                    ? renameCommand
                    : reportCommand;
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
                    VSCode 터미널에서 첫 설치 명령어 입력 이후 재실행 명령어만
                    입력하면 됩니다.
                    <br />
                    Windows 및 macOS / Linux 환경에서 모두 동일하게 동작합니다.
                    <br />
                    최초 설치 시에는 PC에 Python이 설치되어 있어야 합니다.
                </p>
            </section>

            <section className={styles.guideGrid}>
                <article className={`feature-card ${styles.guideCard}`}>
                    <Terminal size={22} />
                    <h2>처음 1회 설치 / 업데이트</h2>
                    <p>
                        {osLabel} 기준 설치 명령어입니다.
                        <br />이 명령어를 실행하면 사용자 로컬 홈 디렉토리에
                        트래커가 설치되며
                        <br />
                        어떤 워크스페이스에서든 같은 트래커를 재사용할 수
                        있습니다.
                        <br />
                        리포트에 update available 이 보일 때도 같은 명령을 다시
                        실행하면 최신 버전으로 덮어씁니다.
                    </p>
                    <div className={`copy-command ${styles.guideCommand}`}>
                        <code>{installCommand}</code>
                        <button
                            className={`copy-command-button ${styles.guideCopyButton}${copied === "install" ? ` is-copied ${styles.isCopied}` : ""}`}
                            type="button"
                            onClick={() => copyCommand("install")}
                        >
                            {copied === "install" ? (
                                <Check size={16} />
                            ) : (
                                <Copy size={16} />
                            )}
                            {copied === "install" ? "복사됨" : "복사"}
                        </button>
                    </div>
                </article>

                <article className={`feature-card ${styles.guideCard}`}>
                    <RotateCcw size={22} />
                    <h2>다시 실행</h2>
                    <p>
                        이후에는 재설치할 필요 없이 아래 명령어로 트래커만
                        재시작하면 됩니다.
                    </p>
                    <div className={`copy-command ${styles.guideCommand}`}>
                        <code>{rerunCommand}</code>
                        <button
                            className={`copy-command-button ${styles.guideCopyButton}${copied === "rerun" ? ` is-copied ${styles.isCopied}` : ""}`}
                            type="button"
                            onClick={() => copyCommand("rerun")}
                        >
                            {copied === "rerun" ? (
                                <Check size={16} />
                            ) : (
                                <Copy size={16} />
                            )}
                            {copied === "rerun" ? "복사됨" : "복사"}
                        </button>
                    </div>
                </article>

                <article className={`feature-card ${styles.guideCard}`}>
                    <RotateCcw size={22} />
                    <h2>이름 변경</h2>
                    <p>
                        이미 설치된 트래커의 사용자 이름을 바꾸려면 아래
                        명령어를 실행하세요.
                        <br />
                        "새 이름" 부분만 본인 이름으로 바꾸면 됩니다.
                    </p>
                    <div className={`copy-command ${styles.guideCommand}`}>
                        <code>{renameCommand}</code>
                        <button
                            className={`copy-command-button ${styles.guideCopyButton}${copied === "rename" ? ` is-copied ${styles.isCopied}` : ""}`}
                            type="button"
                            onClick={() => copyCommand("rename")}
                        >
                            {copied === "rename" ? (
                                <Check size={16} />
                            ) : (
                                <Copy size={16} />
                            )}
                            {copied === "rename" ? "복사됨" : "복사"}
                        </button>
                    </div>
                </article>

                <article className={`feature-card ${styles.guideCard}`}>
                    <Terminal size={22} />
                    <h2>터미널에서 사용량 확인</h2>
                    <p>
                        웹 대시보드 접속 없이도 현재 계정의 토큰 사용량을
                        <br />
                        터미널에서 바로 확인할 수 있습니다.
                    </p>
                    <div className={`copy-command ${styles.guideCommand}`}>
                        <code>{reportCommand}</code>
                        <button
                            className={`copy-command-button ${styles.guideCopyButton}${copied === "report" ? ` is-copied ${styles.isCopied}` : ""}`}
                            type="button"
                            onClick={() => copyCommand("report")}
                        >
                            {copied === "report" ? (
                                <Check size={16} />
                            ) : (
                                <Copy size={16} />
                            )}
                            {copied === "report" ? "복사됨" : "복사"}
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
                    <p>3. 다음부터는 재실행 명령어만 입력해 트래커를 켭니다.</p>
                    <p>
                        4. 이름을 바꾸고 싶을 때는 이름 변경 명령을 실행합니다.
                    </p>
                    <p>5. 사용량은 터미널 또는 대시보드에서 확인합니다.</p>
                </article>
                <article className="feature-card">
                    <ArrowRight size={22} />
                    <h2>확인 방법</h2>
                    <p>
                        트래커가 실행되면 AI 에이전트가 로컬에 남긴 로그 파일을
                        읽고
                        <br />
                        토큰 사용량 변화를 기록한 뒤 10분 간격으로 대시보드에
                        반영됩니다.
                    </p>
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
