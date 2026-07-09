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
    Bot,
    CalendarRange,
    Download,
    LogOut,
    Radio,
    Scale,
    Sparkles,
    UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
const DASHBOARD_TIMEZONE = "Asia/Seoul";

function dashboardDateKey(date: Date) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: DASHBOARD_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value ?? "0000";
    const month = parts.find((part) => part.type === "month")?.value ?? "01";
    const day = parts.find((part) => part.type === "day")?.value ?? "01";

    return `${year}-${month}-${day}`;
}

function recentDateKeys(days: number) {
    return Array.from({ length: days }, (_, index) => {
        const offset = days - 1 - index;
        const date = new Date(Date.now() - offset * 24 * 60 * 60 * 1000);
        return dashboardDateKey(date);
    });
}

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
        ownerId: data.ownerId ?? "",
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

type TrendMode = "absolute" | "normalized";
type PeriodFilter = "7d" | "30d" | "all";
type AgentFilter = "all" | "codex" | "claude";

function uniqueSortedDateKeys(items: UsageSummary[]) {
    return Array.from(
        new Set(items.map((item) => item.dateKey).filter(Boolean)),
    ).sort();
}

export default function DashboardPage() {
    const [user, setUser] = useState<User | null>(null);
    const [authReady, setAuthReady] = useState(false);
    const [summaries, setSummaries] = useState<UsageSummary[]>([]);
    const [trendMode, setTrendMode] = useState<TrendMode>("absolute");
    const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("7d");
    const [agentFilter, setAgentFilter] = useState<AgentFilter>("all");
    const [selectedOwners, setSelectedOwners] = useState<string[]>([]);
    const [selectedSummaryId, setSelectedSummaryId] = useState("");

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
            limit(2000),
        );

        return onSnapshot(usageQuery, (snapshot) => {
            setSummaries(
                snapshot.docs.map((doc) => mapSummary(doc.id, doc.data())),
            );
        });
    }, [user]);

    const allOwners = useMemo(() => summarizeByOwner(summaries), [summaries]);
    const availableDateKeys = useMemo(
        () => uniqueSortedDateKeys(summaries),
        [summaries],
    );
    const activeDateKeys = useMemo(() => {
        if (periodFilter === "7d") {
            return recentDateKeys(7);
        }
        if (periodFilter === "30d") {
            return recentDateKeys(30);
        }
        return availableDateKeys;
    }, [availableDateKeys, periodFilter]);
    const activeDateKeySet = useMemo(
        () => new Set(activeDateKeys),
        [activeDateKeys],
    );
    const filteredSummaries = useMemo(
        () =>
            summaries.filter((item) => {
                if (!activeDateKeySet.has(item.dateKey)) {
                    return false;
                }
                if (agentFilter !== "all" && item.agent !== agentFilter) {
                    return false;
                }
                if (selectedOwners.length > 0) {
                    return selectedOwners.includes(item.ownerId || item.ownerName);
                }
                return true;
            }),
        [activeDateKeySet, agentFilter, selectedOwners, summaries],
    );
    const summary = useMemo(
        () => summarizeByOwner(filteredSummaries),
        [filteredSummaries],
    );
    const totalTokens = filteredSummaries.reduce(
        (sum, item) => sum + activeTokenCount(item),
        0,
    );
    const rawTotalTokens = filteredSummaries.reduce(
        (sum, item) => sum + item.totalTokens,
        0,
    );
    const totalSessions = filteredSummaries.reduce(
        (sum, item) => sum + item.sessions,
        0,
    );
    const totalEvents = filteredSummaries.reduce((sum, item) => sum + item.events, 0);
    const lastEventDate = toDate(filteredSummaries[0]?.lastCompletedAt ?? null);
    const recentTableRows = filteredSummaries.slice(0, 12);
    const chartTotalTokens = Math.max(totalTokens, 1);
    const topOwner = summary[0];
    const trackedUsers = summary.length;
    const dateKeys = activeDateKeys;
    const trendOwners =
        selectedOwners.length > 0
            ? summary.filter((owner) =>
                  selectedOwners.includes(owner.ownerId || owner.ownerName),
              )
            : summary.slice(0, 5);
    const trendMatrix = new Map<string, number>();

    for (const item of filteredSummaries) {
        if (!item.dateKey) {
            continue;
        }

        const ownerKey = item.ownerId || item.ownerName;
        const trendKey = `${ownerKey}::${item.dateKey}`;
        trendMatrix.set(
            trendKey,
            (trendMatrix.get(trendKey) ?? 0) + activeTokenCount(item),
        );
    }

    useEffect(() => {
        if (!selectedOwners.length) {
            return;
        }

        const validKeys = new Set(
            allOwners.map((item) => item.ownerId || item.ownerName),
        );
        const nextSelected = selectedOwners.filter((item) => validKeys.has(item));
        if (nextSelected.length !== selectedOwners.length) {
            setSelectedOwners(nextSelected);
        }
    }, [allOwners, selectedOwners]);

    function toggleOwnerSelection(ownerKey: string) {
        setSelectedOwners((current) =>
            current.includes(ownerKey)
                ? current.filter((item) => item !== ownerKey)
                : [...current, ownerKey],
        );
    }

    function exportSummaries(format: "csv" | "json") {
        const rows = filteredSummaries.map((item) => ({
            time:
                toDate(item.lastCompletedAt)?.toLocaleString("ko-KR") ?? "-",
            agent: item.agent,
            ownerName: item.ownerName,
            ownerId: item.ownerId,
            dateKey: item.dateKey,
            activeTokens: activeTokenCount(item),
            totalTokens: item.totalTokens,
            inputTokens: item.inputTokens,
            outputTokens: item.outputTokens,
            cachedTokens: item.cachedTokens,
            cacheCreationTokens: item.cacheCreationTokens,
            reasoningTokens: item.reasoningTokens,
            sessions: item.sessions,
            events: item.events,
            source: item.source,
        }));

        const filename = `agent-usage-${periodFilter}-${agentFilter}.${format}`;
        const content =
            format === "json"
                ? JSON.stringify(rows, null, 2)
                : [
                      Object.keys(rows[0] ?? {}).join(","),
                      ...rows.map((row) =>
                          Object.values(row)
                              .map((value) =>
                                  `"${String(value ?? "").replaceAll('"', '""')}"`,
                              )
                              .join(","),
                      ),
                  ].join("\n");

        const blob = new Blob([content], {
            type:
                format === "json"
                    ? "application/json"
                    : "text/csv;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        URL.revokeObjectURL(url);
    }

    useEffect(() => {
        if (!recentTableRows.length) {
            setSelectedSummaryId("");
            return;
        }

        if (!selectedSummaryId) {
            setSelectedSummaryId(recentTableRows[0]?.id ?? "");
            return;
        }

        const stillVisible = recentTableRows.some(
            (item) => item.id === selectedSummaryId,
        );
        if (!stillVisible) {
            setSelectedSummaryId(recentTableRows[0]?.id ?? "");
        }
    }, [recentTableRows, selectedSummaryId]);

    const selectedSummary =
        recentTableRows.find((item) => item.id === selectedSummaryId) ??
        recentTableRows[0] ??
        null;

    const trendMaxTokens = Math.max(
        1,
        ...trendOwners.flatMap((owner) =>
            dateKeys.map(
                (dateKey) =>
                    trendMatrix.get(`${owner.ownerId || owner.ownerName}::${dateKey}`) ?? 0,
            ),
        ),
    );
    const trendOwnerMaxMap = new Map(
        trendOwners.map((owner) => {
            const values = dateKeys.map(
                (dateKey) =>
                    trendMatrix.get(`${owner.ownerId || owner.ownerName}::${dateKey}`) ?? 0,
            );
            return [owner.ownerId || owner.ownerName, Math.max(1, ...values)] as const;
        }),
    );
    const chartWidth = 920;
    const chartHeight = 320;
    const chartPaddingLeft = 74;
    const chartPaddingRight = 28;
    const chartPaddingTop = 18;
    const chartPaddingBottom = 58;
    const plotWidth = chartWidth - chartPaddingLeft - chartPaddingRight;
    const plotHeight = chartHeight - chartPaddingTop - chartPaddingBottom;
    const xDenominator = Math.max(dateKeys.length - 1, 1);
    const xTicks = dateKeys.map((dateKey, index) => ({
        dateKey,
        x: chartPaddingLeft + (plotWidth * index) / xDenominator,
    }));
    const trendSeries = trendOwners.map((owner, ownerIndex) => {
        const ownerKey = owner.ownerId || owner.ownerName;
        const values = dateKeys.map(
            (dateKey) =>
                trendMatrix.get(`${ownerKey}::${dateKey}`) ?? 0,
        );
        const ownerMaxTokens = trendOwnerMaxMap.get(ownerKey) ?? 1;
        const points = values.map((tokens, index) => {
            const dateKey = dateKeys[index] ?? "";
            const x = chartPaddingLeft + (plotWidth * index) / xDenominator;
            const scaledRatio =
                trendMode === "normalized"
                    ? tokens / ownerMaxTokens
                    : tokens / trendMaxTokens;
            const y =
                chartPaddingTop +
                plotHeight -
                scaledRatio * plotHeight;
            return { x, y, tokens, dateKey, ratio: scaledRatio };
        });

        return {
            ownerName: owner.ownerName,
            totalTokens: owner.totalTokens,
            ownerMaxTokens,
            color: TREND_COLORS[ownerIndex % TREND_COLORS.length],
            values,
            points,
            polyline: points.map((point) => `${point.x},${point.y}`).join(" "),
        };
    });
    const yGridRatios = [1, 0.75, 0.5, 0.25, 0];
    const yGridValues = yGridRatios.map((ratio) => {
        const value =
            trendMode === "normalized"
                ? `${Math.round(ratio * 100)}%`
                : formatNumber(Math.round(trendMaxTokens * ratio));
        return {
            value,
            key: `${trendMode}-${ratio}`,
            y: chartPaddingTop + plotHeight - plotHeight * ratio,
        };
    });

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
                            유저별 토큰 추이
                        </h2>
                        <div className={styles.trendControls}>
                            <label className={styles.inlineFilterField}>
                                <CalendarRange size={14} />
                                <select
                                    className={styles.inlineFilterSelect}
                                    value={periodFilter}
                                    onChange={(event) =>
                                        setPeriodFilter(
                                            event.target.value as PeriodFilter,
                                        )
                                    }
                                >
                                    <option value="7d">최근 7일</option>
                                    <option value="30d">최근 30일</option>
                                    <option value="all">전체</option>
                                </select>
                            </label>
                            <label className={styles.inlineFilterField}>
                                <Bot size={14} />
                                <select
                                    className={styles.inlineFilterSelect}
                                    value={agentFilter}
                                    onChange={(event) =>
                                        setAgentFilter(
                                            event.target.value as AgentFilter,
                                        )
                                    }
                                >
                                    <option value="all">전체 에이전트</option>
                                    <option value="codex">Codex</option>
                                    <option value="claude">Claude</option>
                                </select>
                            </label>
                            <div
                                className={styles.modeToggle}
                                role="tablist"
                                aria-label="토큰 추이 표시 모드"
                            >
                                <button
                                    className={trendMode === "absolute" ? styles.modeButtonActive : styles.modeButton}
                                    type="button"
                                    onClick={() => setTrendMode("absolute")}
                                >
                                    <Scale size={14} />
                                    absolute
                                </button>
                                <button
                                    className={trendMode === "normalized" ? styles.modeButtonActive : styles.modeButton}
                                    type="button"
                                    onClick={() => setTrendMode("normalized")}
                                >
                                    <Sparkles size={14} />
                                    relative
                                </button>
                            </div>
                            <span className="live">
                                <Activity size={14} />
                                active only
                            </span>
                        </div>
                    </div>
                    {trendOwners.length && dateKeys.length ? (
                        <div
                            className={styles.trendChart}
                            aria-label="유저별 최근 7일 토큰 추이"
                        >
                            <div className={styles.ownerFilterRow}>
                                <button
                                    className={
                                        selectedOwners.length === 0
                                            ? styles.ownerChipActive
                                            : styles.ownerChip
                                    }
                                    type="button"
                                    onClick={() => setSelectedOwners([])}
                                >
                                    <UserRound size={14} />
                                    전체 사용자
                                </button>
                                {allOwners.map((owner) => {
                                    const ownerKey =
                                        owner.ownerId || owner.ownerName;
                                    const selected =
                                        selectedOwners.includes(ownerKey);
                                    return (
                                        <button
                                            className={
                                                selected
                                                    ? styles.ownerChipActive
                                                    : styles.ownerChip
                                            }
                                            key={ownerKey}
                                            type="button"
                                            onClick={() =>
                                                toggleOwnerSelection(ownerKey)
                                            }
                                        >
                                            <span
                                                className={styles.ownerChipDot}
                                                style={{
                                                    backgroundColor:
                                                        TREND_COLORS[
                                                            allOwners.findIndex(
                                                                (item) =>
                                                                    (item.ownerId ||
                                                                        item.ownerName) ===
                                                                    ownerKey,
                                                            ) %
                                                                TREND_COLORS.length
                                                        ],
                                                }}
                                            />
                                            {owner.ownerName}
                                        </button>
                                    );
                                })}
                            </div>
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
                                <svg
                                    className={styles.trendSvg}
                                    viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                                    role="img"
                                    aria-label={
                                        trendMode === "normalized"
                                            ? "사용자별 일별 active token normalized line chart"
                                            : "사용자별 일별 active token line chart"
                                    }
                                >
                                    {xTicks.map((tick) => (
                                        <line
                                            key={`x-${tick.dateKey}`}
                                            className={styles.verticalGridLine}
                                            x1={tick.x}
                                            x2={tick.x}
                                            y1={chartPaddingTop}
                                            y2={chartPaddingTop + plotHeight}
                                        />
                                    ))}
                                    {yGridValues.map((tick) => (
                                        <g key={tick.key}>
                                            <line
                                                className={styles.gridLine}
                                                x1={chartPaddingLeft}
                                                x2={chartWidth - chartPaddingRight}
                                                y1={tick.y}
                                                y2={tick.y}
                                            />
                                            <text
                                                className={styles.axisText}
                                                x={chartPaddingLeft - 14}
                                                y={tick.y}
                                                textAnchor="end"
                                                dominantBaseline="middle"
                                            >
                                                {tick.value}
                                            </text>
                                        </g>
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
                                                        {trendMode === "normalized"
                                                            ? `${series.ownerName} · ${point.dateKey} · ${Math.round(point.ratio * 100)}% · ${formatNumber(point.tokens)} tokens`
                                                            : `${series.ownerName} · ${point.dateKey} · ${formatNumber(point.tokens)} tokens`}
                                                    </title>
                                                </g>
                                            ))}
                                        </g>
                                    ))}
                                    {xTicks.map((tick) => (
                                        <text
                                            className={
                                                periodFilter === "30d"
                                                    ? `${styles.dateText} ${styles.dateTextDense}`
                                                    : styles.dateText
                                            }
                                            key={`date-${tick.dateKey}`}
                                            x={tick.x}
                                            y={chartHeight - 18}
                                            textAnchor="middle"
                                            dominantBaseline="middle"
                                        >
                                            {formatDateKey(tick.dateKey)}
                                        </text>
                                    ))}
                                </svg>
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
                        <div className="page-actions">
                            <button
                                className="button secondary"
                                type="button"
                                onClick={() => exportSummaries("csv")}
                            >
                                <Download size={16} />
                                CSV
                            </button>
                            <button
                                className="button secondary"
                                type="button"
                                onClick={() => exportSummaries("json")}
                            >
                                <Download size={16} />
                                JSON
                            </button>
                        </div>
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
                            {recentTableRows.length ? (
                                recentTableRows.map((item) => {
                                    const completedAt = toDate(
                                        item.lastCompletedAt,
                                    );
                                    return (
                                        <tr
                                            className={
                                                item.id === selectedSummaryId
                                                    ? styles.detailRowActive
                                                    : styles.detailRow
                                            }
                                            key={item.id}
                                            onClick={() =>
                                                setSelectedSummaryId(item.id)
                                            }
                                        >
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
                    {selectedSummary ? (
                        <div className={styles.detailPanel}>
                            <div className={styles.detailHeader}>
                                <div>
                                    <p className="eyebrow">Selected day</p>
                                    <h3>
                                        {selectedSummary.ownerName} ·{" "}
                                        {selectedSummary.dateKey}
                                    </h3>
                                </div>
                                <span
                                    className={`agent-pill ${selectedSummary.agent}`}
                                >
                                    {selectedSummary.agent}
                                </span>
                            </div>
                            <div className={styles.detailGrid}>
                                <div className={styles.detailMetric}>
                                    <span>active tokens</span>
                                    <strong>
                                        {formatNumber(
                                            activeTokenCount(selectedSummary),
                                        )}
                                    </strong>
                                </div>
                                <div className={styles.detailMetric}>
                                    <span>raw total</span>
                                    <strong>
                                        {formatNumber(selectedSummary.totalTokens)}
                                    </strong>
                                </div>
                                <div className={styles.detailMetric}>
                                    <span>input</span>
                                    <strong>
                                        {formatNumber(selectedSummary.inputTokens)}
                                    </strong>
                                </div>
                                <div className={styles.detailMetric}>
                                    <span>output</span>
                                    <strong>
                                        {formatNumber(selectedSummary.outputTokens)}
                                    </strong>
                                </div>
                                <div className={styles.detailMetric}>
                                    <span>cached read</span>
                                    <strong>
                                        {formatNumber(selectedSummary.cachedTokens)}
                                    </strong>
                                </div>
                                <div className={styles.detailMetric}>
                                    <span>cache create</span>
                                    <strong>
                                        {formatNumber(
                                            selectedSummary.cacheCreationTokens,
                                        )}
                                    </strong>
                                </div>
                                <div className={styles.detailMetric}>
                                    <span>reasoning</span>
                                    <strong>
                                        {formatNumber(
                                            selectedSummary.reasoningTokens,
                                        )}
                                    </strong>
                                </div>
                                <div className={styles.detailMetric}>
                                    <span>sessions</span>
                                    <strong>
                                        {formatNumber(selectedSummary.sessions)}
                                    </strong>
                                </div>
                                <div className={styles.detailMetric}>
                                    <span>events</span>
                                    <strong>
                                        {formatNumber(selectedSummary.events)}
                                    </strong>
                                </div>
                            </div>
                            <div className={styles.detailFoot}>
                                <span>
                                    source: {selectedSummary.source || "daily-agent-summary"}
                                </span>
                                <span>
                                    updated:{" "}
                                    {toDate(selectedSummary.lastCompletedAt)?.toLocaleString(
                                        "ko-KR",
                                    ) ?? "-"}
                                </span>
                            </div>
                        </div>
                    ) : null}
                </article>
            </section>
        </main>
    );
}
