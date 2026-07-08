"use client";

import {
    collection,
    limit,
    onSnapshot,
    orderBy,
    query,
    type DocumentData,
} from "firebase/firestore";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import Link from "next/link";
import {
    Activity,
    BarChart3,
    LogOut,
    Radio,
    Sparkles,
    UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { auth, db, hasFirebaseConfig } from "@/lib/firebase";
import {
    activeTokenCount,
    formatNumber,
    summarizeByOwner,
    toDate,
    type UsageSummary,
} from "@/lib/usage";
import styles from "./trend-chart.module.css";

const TREND_COLORS = ["#2f7df6", "#ff9f0a", "#7dd3fc", "#8fd7a7", "#f472b6"];

function formatDateKey(dateKey: string) {
    if (!dateKey || !dateKey.includes("-")) {
        return dateKey || "-";
    }

    const [, month, day] = dateKey.split("-");
    return `${month}.${day}`;
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
            setSummaries(
                snapshot.docs.map((doc) => mapSummary(doc.id, doc.data())),
            );
        });
    }, [user]);

    const summary = summarizeByOwner(summaries);
    const totalTokens = summaries.reduce(
        (sum, item) => sum + activeTokenCount(item),
        0,
    );
    const rawTotalTokens = summaries.reduce(
        (sum, item) => sum + item.totalTokens,
        0,
    );
    const totalSessions = summaries.reduce(
        (sum, item) => sum + item.sessions,
        0,
    );
    const totalEvents = summaries.reduce((sum, item) => sum + item.events, 0);
    const lastEventDate = toDate(summaries[0]?.lastCompletedAt ?? null);
    const chartTotalTokens = Math.max(totalTokens, 1);
    const topOwner = summary[0];
    const trackedUsers = summary.length;
    const dateKeys = Array.from(
        new Set(summaries.map((item) => item.dateKey).filter(Boolean)),
    )
        .sort()
        .slice(-7);
    const trendOwners = summary.slice(0, 5);
    const trendMatrix = new Map<string, number>();

    for (const item of summaries) {
        if (!item.dateKey) {
            continue;
        }

        const trendKey = `${item.ownerName}::${item.dateKey}`;
        trendMatrix.set(
            trendKey,
            (trendMatrix.get(trendKey) ?? 0) + activeTokenCount(item),
        );
    }

    const trendMaxTokens = Math.max(
        1,
        ...trendOwners.flatMap((owner) =>
            dateKeys.map(
                (dateKey) =>
                    trendMatrix.get(`${owner.ownerName}::${dateKey}`) ?? 0,
            ),
        ),
    );
    const chartWidth = 920;
    const chartHeight = 280;
    const chartPaddingX = 28;
    const chartPaddingTop = 18;
    const chartPaddingBottom = 54;
    const plotWidth = chartWidth - chartPaddingX * 2;
    const plotHeight = chartHeight - chartPaddingTop - chartPaddingBottom;
    const xDenominator = Math.max(dateKeys.length - 1, 1);
    const trendSeries = trendOwners.map((owner, ownerIndex) => {
        const values = dateKeys.map(
            (dateKey) => trendMatrix.get(`${owner.ownerName}::${dateKey}`) ?? 0,
        );
        const points = values.map((tokens, index) => {
            const dateKey = dateKeys[index] ?? "";
            const x = chartPaddingX + (plotWidth * index) / xDenominator;
            const y =
                chartPaddingTop +
                plotHeight -
                (tokens / trendMaxTokens) * plotHeight;
            return { x, y, tokens, dateKey };
        });

        return {
            ownerName: owner.ownerName,
            totalTokens: owner.totalTokens,
            color: TREND_COLORS[ownerIndex % TREND_COLORS.length],
            values,
            points,
            polyline: points.map((point) => `${point.x},${point.y}`).join(" "),
        };
    });
    const yGridValues = [1, 0.5, 0].map((ratio) => ({
        value: Math.round(trendMaxTokens * ratio),
        y: chartPaddingTop + plotHeight - plotHeight * ratio,
    }));

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
                <section className="auth-panel">
                    Firebase Auth 확인 중...
                </section>
            </main>
        );
    }

    if (!user) {
        return (
            <main className="page auth-shell">
                <section className="auth-panel">
                    <p className="eyebrow">Protected dashboard</p>
                    <h1>로그인이 필요합니다</h1>
                    <p>
                        팀 사용량을 보려면 먼저 로그인하거나 계정을 만들어
                        주세요.
                    </p>
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

            <section className="summary-grid">
                <article className="metric">
                    <span>active tokens</span>
                    <strong>{formatNumber(totalTokens)}</strong>
                    <small>Raw token: {formatNumber(rawTotalTokens)}</small>
                </article>
                <article className="metric">
                    <span>tracked users</span>
                    <strong>{formatNumber(trackedUsers)}</strong>
                    <small>
                        {topOwner
                            ? `Top user: ${topOwner.ownerName} · ${formatNumber(topOwner.totalTokens)}`
                            : "아직 없음"}
                    </small>
                </article>
                <article className="metric">
                    <span>sessions</span>
                    <strong>{formatNumber(totalSessions)}</strong>
                    <small>총 세션 수</small>
                </article>
                <article className="metric">
                    <span>events</span>
                    <strong>{formatNumber(totalEvents)}</strong>
                    <small>에이전트의 총 응답 수</small>
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

            <section className={styles.trendGrid}>
                <article className={`panel ${styles.trendPanel}`}>
                    <div className="panel-header">
                        <h2>
                            <BarChart3 size={18} />
                            유저별 최근 7일 토큰 추이
                        </h2>
                        <span className="live">
                            <Activity size={14} />
                            active only
                        </span>
                    </div>
                    {trendOwners.length && dateKeys.length ? (
                        <div
                            className={styles.trendChart}
                            aria-label="유저별 최근 7일 토큰 추이"
                        >
                            <div className={styles.trendLegend}>
                                {trendSeries.map((series) => (
                                    <div
                                        className={styles.legendItem}
                                        key={series.ownerName}
                                    >
                                        <span
                                            className={styles.legendDot}
                                            style={{
                                                backgroundColor: series.color,
                                            }}
                                        />
                                        <strong>{series.ownerName}</strong>
                                        <span>
                                            {formatNumber(series.totalTokens)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <div className={styles.trendCanvas}>
                                <div className={styles.trendAxis}>
                                    {yGridValues.map((tick) => (
                                        <span
                                            className={styles.axisLabel}
                                            key={tick.value}
                                            style={{ top: `${tick.y}px` }}
                                        >
                                            {formatNumber(tick.value)}
                                        </span>
                                    ))}
                                </div>
                                <svg
                                    className={styles.trendSvg}
                                    viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                                    role="img"
                                    aria-label="사용자별 일별 active token line chart"
                                >
                                    {yGridValues.map((tick) => (
                                        <line
                                            key={tick.value}
                                            className={styles.gridLine}
                                            x1={chartPaddingX}
                                            x2={chartWidth - chartPaddingX}
                                            y1={tick.y}
                                            y2={tick.y}
                                        />
                                    ))}
                                    {trendSeries.map((series) => (
                                        <g key={series.ownerName}>
                                            <polyline
                                                className={styles.lineShadow}
                                                points={series.polyline}
                                                style={{ stroke: series.color }}
                                            />
                                            <polyline
                                                className={styles.linePath}
                                                points={series.polyline}
                                                style={{ stroke: series.color }}
                                            />
                                            {series.points.map((point) => (
                                                <g
                                                    key={`${series.ownerName}-${point.dateKey}`}
                                                >
                                                    <circle
                                                        className={
                                                            styles.pointGlow
                                                        }
                                                        cx={point.x}
                                                        cy={point.y}
                                                        r="11"
                                                        style={{
                                                            fill: series.color,
                                                        }}
                                                    />
                                                    <circle
                                                        className={styles.point}
                                                        cx={point.x}
                                                        cy={point.y}
                                                        r="7"
                                                        style={{
                                                            fill: series.color,
                                                        }}
                                                    />
                                                    <title>
                                                        {`${series.ownerName} · ${point.dateKey} · ${formatNumber(point.tokens)} tokens`}
                                                    </title>
                                                </g>
                                            ))}
                                        </g>
                                    ))}
                                </svg>
                                <div className={styles.dateAxis}>
                                    {dateKeys.map((dateKey) => (
                                        <span key={dateKey}>
                                            {formatDateKey(dateKey)}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="empty">
                            최근 일자 집계가 쌓이면 사용자별 추이 그래프가
                            나타납니다.
                        </div>
                    )}
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
                        <div
                            className="token-chart"
                            aria-label="사용자별 토큰 사용량"
                        >
                            {summary.slice(0, 8).map((item, index) => {
                                const share =
                                    item.totalTokens / chartTotalTokens;
                                const width = Math.max(share * 100, 4);
                                return (
                                    <div
                                        className="chart-row"
                                        key={item.ownerName}
                                    >
                                        <div className="chart-label">
                                            <strong>{item.ownerName}</strong>
                                            <span>
                                                {formatNumber(item.sessions)}{" "}
                                                sessions ·{" "}
                                                {formatNumber(item.events)}{" "}
                                                responses
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
                                            <span>
                                                {(share * 100).toFixed(1)}%
                                            </span>
                                            {formatNumber(item.totalTokens)}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="empty">
                            워처가 일자 집계를 올리면 사용자별 그래프가
                            나타납니다.
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
                                            {formatNumber(item.sessions)}{" "}
                                            sessions ·{" "}
                                            {formatNumber(item.events)}{" "}
                                            responses ·{" "}
                                            {(
                                                (item.totalTokens /
                                                    chartTotalTokens) *
                                                100
                                            ).toFixed(1)}
                                            %
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
                                                    activeTokenCount(item),
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
