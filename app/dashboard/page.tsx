"use client";

import {
    collection,
    limit,
    onSnapshot,
    orderBy,
    query,
    type DocumentData,
} from "firebase/firestore";
import {
    onAuthStateChanged,
    signOut,
    type User,
} from "firebase/auth";
import Link from "next/link";
import {
    Activity,
    BarChart3,
    Copy,
    LogOut,
    Radio,
    Sparkles,
    UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { auth, db, hasFirebaseConfig } from "@/lib/firebase";
import {
    formatNumber,
    summarizeByAgent,
    summarizeByOwner,
    toDate,
    type UsageSummary,
} from "@/lib/usage";

const PRODUCTION_URL = "https://agent-usage-tracker.vercel.app";

type OsKind = "windows" | "macos" | "unknown";

function detectOs(): OsKind {
    const userAgent = navigator.userAgent.toLowerCase();
    const platform = navigator.platform.toLowerCase();

    if (userAgent.includes("windows") || platform.includes("win")) {
        return "windows";
    }
    if (
        userAgent.includes("mac os") ||
        userAgent.includes("macintosh") ||
        platform.includes("mac")
    ) {
        return "macos";
    }
    return "unknown";
}

function installCommand(os: OsKind) {
    if (os === "windows") {
        return `powershell -NoProfile -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create((irm '${PRODUCTION_URL}/api/install/windows')))"`;
    }

    return `/usr/bin/curl -fsSL '${PRODUCTION_URL}/api/install/python' | python3`;
}

function rerunCommand(os: OsKind) {
    if (os === "windows") {
        return "cd .agent-usage-tracker && py -3 track_agent_usage.py";
    }

    return 'cd ".agent-usage-tracker" && python3 track_agent_usage.py';
}

function osLabel(os: OsKind) {
    if (os === "windows") {
        return "Windows";
    }
    if (os === "macos") {
        return "macOS";
    }
    return "Python";
}

function mapSummary(id: string, data: DocumentData): UsageSummary {
    return {
        id,
        summaryId: data.summaryId ?? id,
        dateKey: data.dateKey ?? "",
        agent: data.agent ?? "unknown",
        ownerName: data.ownerName ?? "unassigned",
        authUid: data.authUid ?? "",
        authEmail: data.authEmail ?? "",
        events: Number(data.events ?? 0),
        sessions: Number(data.sessions ?? 0),
        inputTokens: Number(data.inputTokens ?? 0),
        cachedTokens: Number(data.cachedTokens ?? 0),
        cacheCreationTokens: Number(data.cacheCreationTokens ?? 0),
        outputTokens: Number(data.outputTokens ?? 0),
        reasoningTokens: Number(data.reasoningTokens ?? 0),
        totalTokens: Number(data.totalTokens ?? 0),
        source: data.source ?? "daily-agent-summary",
        lastCompletedAt: data.lastCompletedAt ?? null,
        syncedAt: data.syncedAt ?? null,
    };
}

export default function DashboardPage() {
    const [user, setUser] = useState<User | null>(null);
    const [authReady, setAuthReady] = useState(false);
    const [summaries, setSummaries] = useState<UsageSummary[]>([]);
    const [os, setOs] = useState<OsKind>("unknown");

    useEffect(() => {
        setOs(detectOs());
    }, []);

    useEffect(() => {
        if (!hasFirebaseConfig() || !auth) {
            setAuthReady(true);
            return;
        }

        return onAuthStateChanged(auth, (nextUser) => {
            setUser(nextUser);
            setAuthReady(true);
        });
    }, []);

    useEffect(() => {
        if (!user || !db) {
            setSummaries([]);
            return;
        }

        const usageQuery = query(
            collection(db, "usageDailySummaries"),
            orderBy("lastCompletedAt", "desc"),
            limit(200),
        );

        return onSnapshot(usageQuery, (snapshot) => {
            setSummaries(snapshot.docs.map((doc) => mapSummary(doc.id, doc.data())));
        });
    }, [user]);

    const summary = summarizeByOwner(summaries);
    const agentSummary = summarizeByAgent(summaries);
    const totalTokens = summaries.reduce(
        (sum, item) => sum + item.totalTokens,
        0,
    );
    const totalSessions = summaries.reduce((sum, item) => sum + item.sessions, 0);
    const totalEvents = summaries.reduce((sum, item) => sum + item.events, 0);
    const lastEventDate = toDate(summaries[0]?.lastCompletedAt ?? null);
    const install = installCommand(os);
    const rerun = rerunCommand(os);
    const chartTotalTokens = Math.max(totalTokens, 1);
    const topOwner = summary[0];

    if (!hasFirebaseConfig()) {
        return (
            <main className="page auth-shell">
                <section className="auth-panel">
                    <p className="eyebrow">Firebase setup</p>
                    <h1>환경변수가 필요합니다</h1>
                    <p>
                        `.env.example`을 기준으로 `.env.local`을 만들고 Firebase
                        Web App 설정값을 채우면 대시보드와 터미널 워처가
                        연결됩니다.
                    </p>
                </section>
            </main>
        );
    }

    if (!authReady) {
        return (
            <main className="page auth-shell">
                <section className="auth-panel">Firebase Auth 확인 중...</section>
            </main>
        );
    }

    if (!user) {
        return (
            <main className="page auth-shell">
                <section className="auth-panel">
                    <p className="eyebrow">Protected dashboard</p>
                    <h1>로그인이 필요합니다</h1>
                    <p>팀 사용량을 보려면 먼저 로그인하거나 계정을 만들어 주세요.</p>
                    <Link className="button" href="/login">
                        로그인/회원가입
                    </Link>
                </section>
            </main>
        );
    }

    return (
        <main className="page">
            <header className="topbar dashboard-topbar">
                <div className="brand">
                    <div className="mark">
                        <Radio size={24} />
                    </div>
                    <div>
                        <p className="eyebrow">Realtime telemetry</p>
                        <h1>Dashboard</h1>
                    </div>
                </div>
                <div className="userbar">
                    <Link href="/">홈</Link>
                    <Link href="/account">
                        <UserRound size={16} />
                        계정
                    </Link>
                    <span>{user.email ?? user.displayName ?? "signed in"}</span>
                    <button
                        className="button secondary"
                        type="button"
                        onClick={() => auth && signOut(auth)}
                    >
                        <LogOut size={16} />
                        로그아웃
                    </button>
                </div>
            </header>

            <section className="dashboard-hero">
                <div>
                    <p className="eyebrow">Live team spend</p>
                    <h2>사용자별 토큰 흐름</h2>
                    <p>
                        Firestore 일자 집계가 갱신되면 아래 그래프와 순위가 함께
                        업데이트됩니다.
                    </p>
                </div>
                <div className="hero-signal">
                    <Sparkles size={18} />
                    <span>
                        {topOwner
                            ? `${topOwner.ownerName} ${formatNumber(topOwner.totalTokens)} tokens`
                            : "waiting for usage"}
                    </span>
                </div>
            </section>

            <section className="command-banner dashboard-command">
                <div className="command-stack">
                    <div className="command-group">
                        <p className="eyebrow">Install watcher · {osLabel(os)}</p>
                        <code>{install}</code>
                    </div>
                    <div className="command-group">
                        <p className="eyebrow">Run again</p>
                        <code>{rerun}</code>
                    </div>
                </div>
                <div className="command-actions">
                    <button
                        className="icon-button"
                        type="button"
                        aria-label="설치 명령 복사"
                        title="설치 명령 복사"
                        onClick={() => navigator.clipboard.writeText(install)}
                    >
                        <Copy size={18} />
                    </button>
                    <button
                        className="icon-button"
                        type="button"
                        aria-label="다시 실행 명령 복사"
                        title="다시 실행 명령 복사"
                        onClick={() => navigator.clipboard.writeText(rerun)}
                    >
                        <Copy size={18} />
                    </button>
                </div>
            </section>

            <section className="summary-grid">
                <article className="metric">
                    <span>total tokens</span>
                    <strong>{formatNumber(totalTokens)}</strong>
                    <small>일자 집계 문서 기준</small>
                </article>
                <article className="metric">
                    <span>agents</span>
                    <strong>{formatNumber(agentSummary.length)}</strong>
                    <small>
                        {agentSummary
                            .map(
                                (item) =>
                                    `${item.agent} ${formatNumber(item.totalTokens)}`,
                            )
                            .join(" · ") || "아직 없음"}
                    </small>
                </article>
                <article className="metric">
                    <span>sessions</span>
                    <strong>{formatNumber(totalSessions)}</strong>
                    <small>일자 집계 기준 세션 수</small>
                </article>
                <article className="metric">
                    <span>events</span>
                    <strong>{formatNumber(totalEvents)}</strong>
                    <small>업로드된 원본 응답 수 합계</small>
                </article>
                <article className="metric">
                    <span>last sync</span>
                    <strong>
                        {lastEventDate
                            ? lastEventDate.toLocaleTimeString("ko-KR")
                            : "-"}
                    </strong>
                    <small>
                        {lastEventDate
                            ? lastEventDate.toLocaleDateString("ko-KR")
                            : "아직 없음"}
                    </small>
                </article>
            </section>

            <section className="dashboard-grid">
                <article className="chart-panel">
                    <div className="panel-header">
                        <h2>
                            <BarChart3 size={18} />
                            사용자별 토큰 그래프
                        </h2>
                        <span className="live">
                            <Activity size={14} />
                            realtime
                        </span>
                    </div>
                    {summary.length ? (
                        <div className="token-chart" aria-label="사용자별 토큰 사용량">
                            {summary.slice(0, 8).map((item, index) => {
                                const share = item.totalTokens / chartTotalTokens;
                                const width = Math.max(share * 100, 4);
                                return (
                                    <div className="chart-row" key={item.ownerName}>
                                        <div className="chart-label">
                                            <strong>{item.ownerName}</strong>
                                            <span>
                                                {formatNumber(item.sessions)} sessions
                                                · {formatNumber(item.events)} responses
                                            </span>
                                        </div>
                                        <div className="chart-track">
                                            <div
                                                className="chart-fill"
                                                style={{
                                                    width: `${width}%`,
                                                    transitionDelay: `${index * 35}ms`,
                                                }}
                                            />
                                        </div>
                                        <div className="chart-value">
                                            <span>{(share * 100).toFixed(1)}%</span>
                                            {formatNumber(item.totalTokens)}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="empty">
                            워처가 일자 집계를 올리면 사용자별 그래프가 나타납니다.
                        </div>
                    )}
                </article>

                <article className="panel">
                    <div className="panel-header">
                        <h2>사용자 순위</h2>
                        <span className="live">
                            <Activity size={14} />
                            live
                        </span>
                    </div>
                    {summary.length ? (
                        <ol className="rank-list">
                            {summary.map((item) => (
                                <li className="rank-item" key={item.ownerName}>
                                    <div>
                                        <div className="rank-name">
                                            {item.ownerName}
                                        </div>
                                        <div className="rank-meta">
                                            {formatNumber(item.sessions)} sessions
                                            · {formatNumber(item.events)} responses
                                            · {((item.totalTokens / chartTotalTokens) * 100).toFixed(1)}%
                                        </div>
                                    </div>
                                    <div className="rank-value">
                                        {formatNumber(item.totalTokens)}
                                    </div>
                                </li>
                            ))}
                        </ol>
                    ) : (
                        <div className="empty">
                            아직 동기화된 사용량이 없습니다.
                        </div>
                    )}
                </article>
            </section>

            <section className="table-grid">
                <article className="table-panel">
                    <div className="panel-header table-title">
                        <h2>최근 일자 집계</h2>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>시간</th>
                                <th>Agent</th>
                                <th>사용자</th>
                                <th>일자</th>
                                <th>토큰</th>
                            </tr>
                        </thead>
                        <tbody>
                            {summaries.length ? (
                                summaries.slice(0, 12).map((item) => {
                                    const completedAt = toDate(
                                        item.lastCompletedAt,
                                    );
                                    return (
                                        <tr key={item.id}>
                                            <td>
                                                {completedAt
                                                    ? completedAt.toLocaleString(
                                                          "ko-KR",
                                                          {
                                                              month: "2-digit",
                                                              day: "2-digit",
                                                              hour: "2-digit",
                                                              minute: "2-digit",
                                                          },
                                                      )
                                                    : "-"}
                                            </td>
                                            <td>
                                                <span
                                                    className={`agent-pill ${item.agent}`}
                                                >
                                                    {item.agent}
                                                </span>
                                            </td>
                                            <td>{item.ownerName}</td>
                                            <td className="mono">
                                                {item.dateKey || "-"}
                                            </td>
                                            <td>
                                                {formatNumber(
                                                    item.totalTokens,
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td className="empty" colSpan={5}>
                                        워처를 실행하면 여기에 일자 집계가
                                        나타납니다.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </article>
            </section>
        </main>
    );
}
