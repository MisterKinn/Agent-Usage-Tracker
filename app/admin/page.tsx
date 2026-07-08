"use client";

import {
    collection,
    onSnapshot,
    orderBy,
    query,
    updateDoc,
    doc,
    limit,
    type DocumentData,
} from "firebase/firestore";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Shield, Waypoints, Mailbox, BarChart3 } from "lucide-react";
import { auth, db, hasFirebaseConfig } from "@/lib/firebase";
import { isAdminEmail } from "@/lib/admin";
import styles from "./admin.module.css";

type ContactMessage = {
    id: string;
    authEmail: string;
    authUid: string;
    createdAt: Date | null;
    message: string;
    os: string;
    ownerName: string;
    status: string;
    subject: string;
};

type VisitorInsight = {
    id: string;
    authEmail: string;
    authUid: string;
    browser: string;
    count: number;
    dateKey: string;
    deviceType: string;
    lastSeenAt: Date | null;
    os: string;
    ownerName: string;
    path: string;
};

function asDate(value: unknown) {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        return value;
    }

    if (typeof value === "object" && value && "toDate" in value) {
        return (value as { toDate: () => Date }).toDate();
    }

    return null;
}

function mapMessage(id: string, data: DocumentData): ContactMessage {
    return {
        id,
        authEmail: data.authEmail ?? "",
        authUid: data.authUid ?? "",
        createdAt: asDate(data.createdAt),
        message: data.message ?? "",
        os: data.os ?? "unknown",
        ownerName: data.ownerName ?? "unknown",
        status: data.status ?? "new",
        subject: data.subject ?? "",
    };
}

function mapInsight(id: string, data: DocumentData): VisitorInsight {
    return {
        id,
        authEmail: data.authEmail ?? "",
        authUid: data.authUid ?? "",
        browser: data.browser ?? "other",
        count: Number(data.count ?? 0),
        dateKey: data.dateKey ?? "",
        deviceType: data.deviceType ?? "desktop",
        lastSeenAt: asDate(data.lastSeenAt),
        os: data.os ?? "other",
        ownerName: data.ownerName ?? "unknown",
        path: data.path ?? "/",
    };
}

function summarizeCounts(values: string[]) {
    const map = new Map<string, number>();
    for (const value of values) {
        map.set(value, (map.get(value) ?? 0) + 1);
    }

    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
}

export default function AdminPage() {
    const [user, setUser] = useState<User | null>(null);
    const [authReady, setAuthReady] = useState(false);
    const [messages, setMessages] = useState<ContactMessage[]>([]);
    const [insights, setInsights] = useState<VisitorInsight[]>([]);

    useEffect(() => {
        if (!auth) {
            setAuthReady(true);
            return;
        }

        return onAuthStateChanged(auth, (nextUser) => {
            setUser(nextUser);
            setAuthReady(true);
        });
    }, []);

    useEffect(() => {
        if (!db || !user || !isAdminEmail(user.email)) {
            setMessages([]);
            setInsights([]);
            return;
        }

        const unsubscribeMessages = onSnapshot(
            query(
                collection(db, "contactMessages"),
                orderBy("createdAt", "desc"),
                limit(100),
            ),
            (snapshot) =>
                setMessages(snapshot.docs.map((item) => mapMessage(item.id, item.data()))),
        );

        const unsubscribeInsights = onSnapshot(
            query(
                collection(db, "visitorInsights"),
                orderBy("lastSeenAt", "desc"),
                limit(300),
            ),
            (snapshot) =>
                setInsights(snapshot.docs.map((item) => mapInsight(item.id, item.data()))),
        );

        return () => {
            unsubscribeMessages();
            unsubscribeInsights();
        };
    }, [user]);

    const osCounts = useMemo(
        () =>
            summarizeCounts(
                insights.flatMap((item) => Array(item.count).fill(item.os)),
            ).slice(0, 6),
        [insights],
    );
    const browserCounts = useMemo(
        () =>
            summarizeCounts(
                insights.flatMap((item) => Array(item.count).fill(item.browser)),
            ).slice(0, 6),
        [insights],
    );
    const pageCounts = useMemo(
        () =>
            summarizeCounts(
                insights.flatMap((item) => Array(item.count).fill(item.path)),
            ).slice(0, 6),
        [insights],
    );
    const totalVisits = insights.reduce((sum, item) => sum + item.count, 0);
    const uniqueUsers = new Set(insights.map((item) => item.authUid)).size;
    const openMessages = messages.filter((item) => item.status !== "resolved").length;

    async function updateMessageStatus(id: string, status: string) {
        if (!db) {
            return;
        }

        await updateDoc(doc(db, "contactMessages", id), { status });
    }

    if (!hasFirebaseConfig()) {
        return (
            <main className="page auth-shell">
                <section className="auth-panel">Firebase 설정이 필요합니다.</section>
            </main>
        );
    }

    if (!authReady) {
        return (
            <main className="page auth-shell">
                <section className="auth-panel">관리자 권한 확인 중...</section>
            </main>
        );
    }

    if (!user) {
        return (
            <main className="page auth-shell">
                <section className="auth-panel">
                    <p className="eyebrow">Admin</p>
                    <h1>로그인이 필요합니다</h1>
                    <p>관리자 페이지를 보려면 먼저 로그인해 주세요.</p>
                    <Link className="button" href="/login">
                        로그인/회원가입
                    </Link>
                </section>
            </main>
        );
    }

    if (!isAdminEmail(user.email)) {
        return (
            <main className="page auth-shell">
                <section className="auth-panel">
                    <p className="eyebrow">Admin</p>
                    <h1>권한이 없습니다</h1>
                    <p>현재 계정은 어드민 페이지에 접근할 수 없습니다.</p>
                </section>
            </main>
        );
    }

    return (
        <main className={`page ${styles.adminLayout}`}>
            <section className="section-heading">
                <p className="eyebrow">Admin</p>
                <h1>관리자</h1>
                <p>문의 접수 현황과 방문 환경 인사이트를 한 곳에서 확인합니다.</p>
            </section>

            <section className={styles.metricGrid}>
                <article className={`feature-card ${styles.metricCard}`}>
                    <span>messages</span>
                    <strong>{messages.length}</strong>
                    <small>전체 문의 수</small>
                </article>
                <article className={`feature-card ${styles.metricCard}`}>
                    <span>open</span>
                    <strong>{openMessages}</strong>
                    <small>미해결 문의</small>
                </article>
                <article className={`feature-card ${styles.metricCard}`}>
                    <span>visits</span>
                    <strong>{totalVisits}</strong>
                    <small>누적 방문 수</small>
                </article>
                <article className={`feature-card ${styles.metricCard}`}>
                    <span>users</span>
                    <strong>{uniqueUsers}</strong>
                    <small>방문한 고유 사용자</small>
                </article>
            </section>

            <section className={styles.adminGrid}>
                <article className={`feature-card ${styles.panel}`}>
                    <h2>
                        <Mailbox size={18} /> 문의함
                    </h2>
                    <div className={styles.messageList}>
                        {messages.length ? (
                            messages.map((message) => (
                                <article className={styles.messageItem} key={message.id}>
                                    <div className={styles.messageMeta}>
                                        <div>
                                            <strong>{message.subject || "(제목 없음)"}</strong>
                                            <div className={styles.messageBody}>
                                                {message.ownerName} · {message.authEmail} · {message.os}
                                            </div>
                                        </div>
                                        <select
                                            className={styles.statusSelect}
                                            value={message.status}
                                            onChange={(event) =>
                                                updateMessageStatus(
                                                    message.id,
                                                    event.target.value,
                                                )
                                            }
                                        >
                                            <option value="new">new</option>
                                            <option value="in-progress">in-progress</option>
                                            <option value="resolved">resolved</option>
                                        </select>
                                    </div>
                                    <div className={styles.messageBody}>{message.message}</div>
                                </article>
                            ))
                        ) : (
                            <div className={styles.empty}>아직 문의가 없습니다.</div>
                        )}
                    </div>
                </article>

                <article className={`feature-card ${styles.panel}`}>
                    <h2>
                        <BarChart3 size={18} /> 환경 인사이트
                    </h2>
                    <div className={styles.pillRow}>
                        <div>
                            <p className="eyebrow">OS</p>
                            <div className={styles.pillWrap}>
                                {osCounts.map(([label, count]) => (
                                    <span className={styles.pill} key={label}>
                                        {label} {count}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div>
                            <p className="eyebrow">Browser</p>
                            <div className={styles.pillWrap}>
                                {browserCounts.map(([label, count]) => (
                                    <span className={styles.pill} key={label}>
                                        {label} {count}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div>
                            <p className="eyebrow">Pages</p>
                            <div className={styles.pillWrap}>
                                {pageCounts.map(([label, count]) => (
                                    <span className={styles.pill} key={label}>
                                        {label} {count}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className={styles.insightList}>
                        {insights.slice(0, 12).map((item) => (
                            <article className={styles.insightItem} key={item.id}>
                                <div className={styles.insightMeta}>
                                    <strong>{item.ownerName || item.authEmail}</strong>
                                    <span>
                                        {item.dateKey} · {item.count} visits
                                    </span>
                                </div>
                                <div className={styles.insightText}>
                                    {item.path} · {item.os} · {item.browser} · {item.deviceType}
                                </div>
                            </article>
                        ))}
                    </div>
                </article>
            </section>
        </main>
    );
}
