"use client";

import {
    collection,
    limit,
    onSnapshot,
    orderBy,
    query,
    updateDoc,
    doc,
    type DocumentData,
} from "firebase/firestore";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    AlertTriangle,
    BarChart3,
    Mailbox,
    PencilLine,
    Shield,
    Trash2,
    UserCog,
    Users,
} from "lucide-react";
import { auth, db, hasFirebaseConfig } from "@/lib/firebase";
import { isAdminEmail } from "@/lib/admin";
import styles from "./admin.module.css";

type ContactMessage = {
    attachments?: Array<{
        name: string;
        path?: string;
        size?: number;
        type?: string;
        url?: string;
    }>;
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

type AuthUserItem = {
    creationTime: string;
    disabled: boolean;
    displayName: string;
    email: string;
    lastSignInTime: string;
    providerIds: string[];
    uid: string;
};

type UsageOwnerSummary = {
    id: string;
    ownerId: string;
    ownerName: string;
    totalEvents: number;
    totalSessions: number;
    totalTokens: number;
    agents: string[];
    lastCompletedAt: Date | null;
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
        attachments: Array.isArray(data.attachments)
            ? data.attachments.map((item: DocumentData) => ({
                  name: item.name ?? "attachment",
                  path: item.path ?? "",
                  size: Number(item.size ?? 0),
                  type: item.type ?? "",
                  url: item.url ?? "",
              }))
            : [],
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

function summarizeTrackedOwners(items: DocumentData[]) {
    const grouped = new Map<string, UsageOwnerSummary>();

    for (const item of items) {
        const ownerName = String(item.ownerName ?? "unknown");
        const ownerId = String(item.ownerId ?? ownerName);
        const key = ownerId || ownerName;
        const lastCompletedAt = asDate(item.lastCompletedAt);
        const agent = String(item.agent ?? "unknown");

        const existing = grouped.get(key);
        if (!existing) {
            grouped.set(key, {
                id: key,
                ownerId,
                ownerName,
                totalEvents: Number(item.events ?? 0),
                totalSessions: Number(item.sessions ?? 0),
                totalTokens: Number(item.totalTokens ?? 0),
                agents: [agent],
                lastCompletedAt,
            });
            continue;
        }

        existing.totalEvents += Number(item.events ?? 0);
        existing.totalSessions += Number(item.sessions ?? 0);
        existing.totalTokens += Number(item.totalTokens ?? 0);
        if (!existing.agents.includes(agent)) {
            existing.agents.push(agent);
        }
        if (
            lastCompletedAt &&
            (!existing.lastCompletedAt ||
                lastCompletedAt.getTime() > existing.lastCompletedAt.getTime())
        ) {
            existing.lastCompletedAt = lastCompletedAt;
        }
    }

    return Array.from(grouped.values()).sort(
        (a, b) => b.totalTokens - a.totalTokens,
    );
}

export default function AdminPage() {
    const [user, setUser] = useState<User | null>(null);
    const [authReady, setAuthReady] = useState(false);
    const [messages, setMessages] = useState<ContactMessage[]>([]);
    const [insights, setInsights] = useState<VisitorInsight[]>([]);
    const [authUsers, setAuthUsers] = useState<AuthUserItem[]>([]);
    const [authUsersError, setAuthUsersError] = useState("");
    const [trackedOwners, setTrackedOwners] = useState<UsageOwnerSummary[]>([]);
    const [busyKey, setBusyKey] = useState("");
    const [actionMessage, setActionMessage] = useState("");
    const [ownerDrafts, setOwnerDrafts] = useState<Record<string, string>>({});

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
            setTrackedOwners([]);
            return;
        }

        const unsubscribeMessages = onSnapshot(
            query(
                collection(db, "contactMessages"),
                orderBy("createdAt", "desc"),
                limit(100),
            ),
            (snapshot) =>
                setMessages(
                    snapshot.docs.map((item) =>
                        mapMessage(item.id, item.data()),
                    ),
                ),
        );

        const unsubscribeInsights = onSnapshot(
            query(
                collection(db, "visitorInsights"),
                orderBy("lastSeenAt", "desc"),
                limit(300),
            ),
            (snapshot) =>
                setInsights(
                    snapshot.docs.map((item) =>
                        mapInsight(item.id, item.data()),
                    ),
                ),
        );

        const unsubscribeUsage = onSnapshot(
            query(
                collection(db, "usageDailySummaries"),
                orderBy("lastCompletedAt", "desc"),
                limit(500),
            ),
            (snapshot) =>
                setTrackedOwners(
                    summarizeTrackedOwners(
                        snapshot.docs.map((item) => item.data()),
                    ),
                ),
        );

        return () => {
            unsubscribeMessages();
            unsubscribeInsights();
            unsubscribeUsage();
        };
    }, [user]);

    useEffect(() => {
        setOwnerDrafts((current) => {
            const next = { ...current };
            for (const owner of trackedOwners) {
                if (!(owner.ownerId in next)) {
                    next[owner.ownerId] = owner.ownerName;
                }
            }
            return next;
        });
    }, [trackedOwners]);

    useEffect(() => {
        async function loadAuthUsers() {
            if (!user) {
                setAuthUsers([]);
                setAuthUsersError("");
                return;
            }

            const token = await user.getIdToken();
            const response = await fetch("/api/admin/auth-users", {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                const payload = (await response.json().catch(() => null)) as
                    | { error?: string }
                    | null;
                throw new Error(
                    payload?.error || "Failed to load Firebase Auth users.",
                );
            }

            const payload = (await response.json()) as {
                users: AuthUserItem[];
            };
            setAuthUsers(payload.users);
            setAuthUsersError("");
        }

        if (user && isAdminEmail(user.email)) {
            void loadAuthUsers().catch((error) => {
                setAuthUsers([]);
                setAuthUsersError(
                    error instanceof Error
                        ? error.message
                        : "Firebase Auth 유저를 불러오지 못했습니다.",
                );
            });
        }
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
    const openMessages = messages.filter(
        (item) => item.status !== "resolved",
    ).length;

    async function adminRequest<T>(
        url: string,
        init?: RequestInit,
    ): Promise<T> {
        if (!user) {
            throw new Error("로그인이 필요합니다.");
        }

        const token = await user.getIdToken();
        const response = await fetch(url, {
            ...init,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
                ...(init?.headers ?? {}),
            },
        });

        const payload = (await response.json().catch(() => null)) as
            | (T & { error?: string })
            | null;

        if (!response.ok) {
            throw new Error(payload?.error || "관리자 요청에 실패했습니다.");
        }

        return payload as T;
    }

    async function updateMessageStatus(id: string, status: string) {
        if (!db) {
            return;
        }

        await updateDoc(doc(db, "contactMessages", id), { status });
    }

    async function deleteMessage(message: ContactMessage) {
        const targetLabel = message.subject || message.id;
        const confirmed = window.confirm(
            `resolved 상태인 "${targetLabel}" 문의를 삭제할까요?`,
        );

        if (!confirmed) {
            return;
        }

        setBusyKey(`message:${message.id}`);
        setActionMessage("");

        try {
            await adminRequest<{ ok: true }>("/api/admin/contact-messages", {
                method: "DELETE",
                body: JSON.stringify({ id: message.id }),
            });
            setActionMessage(`${targetLabel} 문의를 삭제했습니다.`);
        } catch (error) {
            setActionMessage(
                error instanceof Error
                    ? `문의 삭제 실패: ${error.message}`
                    : "문의 삭제 실패",
            );
        } finally {
            setBusyKey("");
        }
    }

    async function deleteTrackedOwner(owner: UsageOwnerSummary) {
        const targetLabel = owner.ownerName || owner.ownerId;
        const confirmed = window.confirm(
            `${targetLabel}의 토큰 사용량 데이터를 삭제할까요?\n대시보드 집계와 tracker client 기록이 함께 제거됩니다.`,
        );

        if (!confirmed) {
            return;
        }

        setBusyKey(`owner-delete:${owner.id}`);
        setActionMessage("");

        try {
            const payload = await adminRequest<{
                deletedTracker: number;
                deletedUsage: number;
            }>("/api/admin/tracked-owners", {
                method: "DELETE",
                body: JSON.stringify({
                    ownerId: owner.ownerId,
                    ownerName: owner.ownerName,
                }),
            });

            setActionMessage(
                `${targetLabel} 정리 완료: usage ${payload.deletedUsage}건, tracker ${payload.deletedTracker}건`,
            );
        } catch (error) {
            setActionMessage(
                error instanceof Error
                    ? `${targetLabel} 정리 실패: ${error.message}`
                    : `${targetLabel} 정리 실패`,
            );
        } finally {
            setBusyKey("");
        }
    }

    async function renameTrackedOwner(owner: UsageOwnerSummary) {
        const nextName = ownerDrafts[owner.ownerId]?.trim() || "";
        if (!nextName || nextName === owner.ownerName) {
            return;
        }

        setBusyKey(`owner-rename:${owner.id}`);
        setActionMessage("");

        try {
            const payload = await adminRequest<{
                updatedTrackerDocs: number;
                updatedUsageDocs: number;
            }>("/api/admin/tracked-owners", {
                method: "PATCH",
                body: JSON.stringify({
                    ownerId: owner.ownerId,
                    ownerName: nextName,
                    previousOwnerName: owner.ownerName,
                }),
            });

            setActionMessage(
                `${owner.ownerName} 이름 변경 완료: ${nextName} · usage ${payload.updatedUsageDocs}건, tracker ${payload.updatedTrackerDocs}건`,
            );
        } catch (error) {
            setActionMessage(
                error instanceof Error
                    ? `이름 변경 실패: ${error.message}`
                    : "이름 변경 실패",
            );
        } finally {
            setBusyKey("");
        }
    }

    async function deleteAuthUser(authUser: AuthUserItem) {
        const targetLabel = authUser.displayName || authUser.email || authUser.uid;
        const confirmed = window.confirm(
            `${targetLabel} Firebase Auth 계정을 삭제할까요?\n연결된 user profile, 방문 기록, 문의 기록도 함께 정리됩니다.`,
        );

        if (!confirmed) {
            return;
        }

        setBusyKey(`auth:${authUser.uid}`);
        setActionMessage("");

        try {
            const payload = await adminRequest<{
                deletedMessages: number;
                deletedProfiles: number;
                deletedVisits: number;
            }>("/api/admin/auth-users", {
                method: "DELETE",
                body: JSON.stringify({ uid: authUser.uid }),
            });

            setAuthUsers((current) =>
                current.filter((item) => item.uid !== authUser.uid),
            );
            setActionMessage(
                `${targetLabel} 삭제 완료: profiles ${payload.deletedProfiles}건, visits ${payload.deletedVisits}건, messages ${payload.deletedMessages}건`,
            );
        } catch (error) {
            setActionMessage(
                error instanceof Error
                    ? `${targetLabel} 삭제 실패: ${error.message}`
                    : `${targetLabel} 삭제 실패`,
            );
        } finally {
            setBusyKey("");
        }
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
                <p>
                    Firebase Auth 유저, 트래킹 사용자 토큰 집계, 문의와 방문
                    인사이트를 한 곳에서 관리합니다.
                </p>
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
                <article className={`feature-card ${styles.metricCard}`}>
                    <span>auth</span>
                    <strong>{authUsers.length}</strong>
                    <small>Firebase Auth 유저</small>
                </article>
                <article className={`feature-card ${styles.metricCard}`}>
                    <span>tracked</span>
                    <strong>{trackedOwners.length}</strong>
                    <small>대시보드 트래킹 사용자</small>
                </article>
            </section>

            {actionMessage ? (
                <section className={styles.flashNotice}>
                    <AlertTriangle size={16} />
                    <span>{actionMessage}</span>
                </section>
            ) : null}

            <section className={styles.adminGrid}>
                <article className={`feature-card ${styles.panel}`}>
                    <h2>
                        <Users size={18} /> 토큰 사용량 관리
                    </h2>
                    <div className={styles.accountList}>
                        {trackedOwners.length ? (
                            trackedOwners.map((owner) => (
                                <article
                                    className={styles.accountItem}
                                    key={owner.id}
                                >
                                    <div className={styles.accountMeta}>
                                        <div>
                                            <strong>
                                                {owner.ownerName || "unknown"}
                                            </strong>
                                            <p>{owner.ownerId || "legacy-id"}</p>
                                        </div>
                                        <div className={styles.accountStats}>
                                            <span>
                                                {owner.totalTokens.toLocaleString()}{" "}
                                                tokens
                                            </span>
                                            <span>
                                                {owner.totalSessions} sessions ·{" "}
                                                {owner.totalEvents} events
                                            </span>
                                            <span>{owner.agents.join(", ")}</span>
                                        </div>
                                        <div className={styles.inlineEditor}>
                                            <input
                                                className={`input ${styles.inlineInput}`}
                                                type="text"
                                                value={
                                                    ownerDrafts[owner.ownerId] ??
                                                    owner.ownerName
                                                }
                                                onChange={(event) =>
                                                    setOwnerDrafts((current) => ({
                                                        ...current,
                                                        [owner.ownerId]:
                                                            event.target.value,
                                                    }))
                                                }
                                            />
                                            <button
                                                className="button secondary"
                                                type="button"
                                                disabled={
                                                    busyKey ===
                                                    `owner-rename:${owner.id}`
                                                }
                                                onClick={() =>
                                                    renameTrackedOwner(owner)
                                                }
                                            >
                                                <PencilLine size={16} />
                                                {busyKey ===
                                                `owner-rename:${owner.id}`
                                                    ? "저장 중..."
                                                    : "이름 저장"}
                                            </button>
                                        </div>
                                    </div>
                                    <button
                                        className="button secondary"
                                        type="button"
                                        disabled={
                                            busyKey ===
                                            `owner-delete:${owner.id}`
                                        }
                                        onClick={() => deleteTrackedOwner(owner)}
                                    >
                                        <Trash2 size={16} />
                                        {busyKey === `owner-delete:${owner.id}`
                                            ? "삭제 중..."
                                            : "사용량 삭제"}
                                    </button>
                                </article>
                            ))
                        ) : (
                            <div className={styles.empty}>
                                아직 집계된 트래킹 사용자가 없습니다.
                            </div>
                        )}
                    </div>
                </article>

                <article className={`feature-card ${styles.panel}`}>
                    <h2>
                        <UserCog size={18} /> Firebase Auth 유저 관리
                    </h2>
                    <div className={styles.accountList}>
                        {authUsersError ? (
                            <div className={styles.errorNotice}>
                                <AlertTriangle size={16} />
                                <div>
                                    <strong>Firebase Auth 유저를 불러오지 못했습니다.</strong>
                                    <p>{authUsersError}</p>
                                </div>
                            </div>
                        ) : authUsers.length ? (
                            authUsers.map((authUser) => (
                                <article
                                    className={styles.accountItem}
                                    key={authUser.uid}
                                >
                                    <div className={styles.accountMeta}>
                                        <div>
                                            <strong>
                                                {authUser.displayName ||
                                                    "이름 없음"}
                                            </strong>
                                            <p>
                                                {authUser.email ||
                                                    "이메일 없음"}
                                            </p>
                                        </div>
                                        <div className={styles.accountStats}>
                                            <span>{authUser.uid}</span>
                                            <span>
                                                {authUser.providerIds.join(", ") ||
                                                    "provider 없음"}
                                            </span>
                                            <span>
                                                {authUser.lastSignInTime ||
                                                    "로그인 기록 없음"}
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        className="button secondary"
                                        type="button"
                                        disabled={
                                            busyKey === `auth:${authUser.uid}`
                                        }
                                        onClick={() => deleteAuthUser(authUser)}
                                    >
                                        <Trash2 size={16} />
                                        {busyKey === `auth:${authUser.uid}`
                                            ? "삭제 중..."
                                            : "Auth 유저 삭제"}
                                    </button>
                                </article>
                            ))
                        ) : (
                            <div className={styles.empty}>
                                Firebase Auth 유저가 없습니다.
                            </div>
                        )}
                    </div>
                </article>

                <article className={`feature-card ${styles.panel}`}>
                    <h2>
                        <Mailbox size={18} /> 문의함
                    </h2>
                    <div className={styles.messageList}>
                        {messages.length ? (
                            messages.map((message) => (
                                <article
                                    className={styles.messageItem}
                                    key={message.id}
                                >
                                    <div className={styles.messageMeta}>
                                        <div>
                                            <strong>
                                                {message.subject ||
                                                    "(제목 없음)"}
                                            </strong>
                                            <div className={styles.messageBody}>
                                                {message.ownerName} ·{" "}
                                                {message.authEmail} · {message.os}
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
                                            <option value="in-progress">
                                                in-progress
                                            </option>
                                            <option value="resolved">
                                                resolved
                                            </option>
                                        </select>
                                    </div>
                                    {message.status === "resolved" ? (
                                        <div className={styles.messageActions}>
                                            <button
                                                className="button secondary"
                                                type="button"
                                                disabled={
                                                    busyKey ===
                                                    `message:${message.id}`
                                                }
                                                onClick={() =>
                                                    deleteMessage(message)
                                                }
                                            >
                                                <Trash2 size={16} />
                                                {busyKey ===
                                                `message:${message.id}`
                                                    ? "삭제 중..."
                                                    : "문의 삭제"}
                                            </button>
                                        </div>
                                    ) : null}
                                    <div className={styles.messageBody}>
                                        {message.message}
                                    </div>
                                    {message.attachments?.length ? (
                                        <div className={styles.attachmentLinks}>
                                            {message.attachments.map(
                                                (attachment, index) => (
                                                    attachment.url ? (
                                                        <a
                                                            className={styles.attachmentLink}
                                                            href={attachment.url}
                                                            key={`${message.id}-${index}`}
                                                            rel="noreferrer"
                                                            target="_blank"
                                                        >
                                                            {attachment.name}
                                                        </a>
                                                    ) : (
                                                        <span
                                                            className={styles.attachmentLink}
                                                            key={`${message.id}-${index}`}
                                                        >
                                                            {attachment.name}
                                                        </span>
                                                    )
                                                ),
                                            )}
                                        </div>
                                    ) : null}
                                </article>
                            ))
                        ) : (
                            <div className={styles.empty}>
                                아직 문의가 없습니다.
                            </div>
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
                            <article
                                className={styles.insightItem}
                                key={item.id}
                            >
                                <div className={styles.insightMeta}>
                                    <strong>
                                        {item.ownerName || item.authEmail}
                                    </strong>
                                    <span>
                                        {item.dateKey} · {item.count} visits
                                    </span>
                                </div>
                                <div className={styles.insightText}>
                                    {item.path} · {item.os} · {item.browser} ·{" "}
                                    {item.deviceType}
                                </div>
                            </article>
                        ))}
                    </div>
                </article>
            </section>
        </main>
    );
}
