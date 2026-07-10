"use client";

import Link from "next/link";
import {
    collection,
    limit,
    onSnapshot,
    query,
    where,
    type DocumentData,
} from "firebase/firestore";
import {
    EmailAuthProvider,
    onAuthStateChanged,
    reauthenticateWithCredential,
    signOut,
    updatePassword,
    updateProfile,
    type User,
} from "firebase/auth";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
    Activity,
    CheckCircle2,
    Copy,
    Link2,
    LogOut,
    Mail,
    RefreshCw,
    TerminalSquare,
    TriangleAlert,
    UserRound,
    Wrench,
} from "lucide-react";
import { auth, db } from "@/lib/firebase";
import {
    detectOsFromNavigator,
    reportCommandFor,
    type OsKind,
} from "@/lib/install-commands";
import { syncUserProfile } from "@/lib/user-profile";
import {
    activeTokenCount,
    formatNumber,
    toDate,
    type UsageSummary,
} from "@/lib/usage";

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

function recentDateKeys(days: number) {
    return Array.from({ length: days }, (_, index) => {
        const date = new Date();
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - index);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    });
}

function readableAccountError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("auth/requires-recent-login")) {
        return "보안을 위해 다시 로그인한 뒤 비밀번호를 변경해 주세요.";
    }
    if (message.includes("auth/invalid-credential")) {
        return "현재 비밀번호가 맞지 않습니다.";
    }
    if (message.includes("auth/weak-password")) {
        return "새 비밀번호는 최소 6자 이상이어야 합니다.";
    }

    return message || "계정 정보를 변경하지 못했습니다.";
}

function metricValueClass(value: string) {
    if (value.length >= 11) {
        return "metric-value metric-value-dense";
    }
    if (value.length >= 9) {
        return "metric-value metric-value-compact";
    }
    return "metric-value";
}

export default function AccountPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [authReady, setAuthReady] = useState(false);
    const [name, setName] = useState("");
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [profileMessage, setProfileMessage] = useState("");
    const [passwordMessage, setPasswordMessage] = useState("");
    const [profileError, setProfileError] = useState("");
    const [passwordError, setPasswordError] = useState("");
    const [viewerOs, setViewerOs] = useState<OsKind>("macos");
    const [usageRows, setUsageRows] = useState<UsageSummary[]>([]);
    const [commandCopied, setCommandCopied] = useState(false);
    const [linkOwnerId, setLinkOwnerId] = useState("");
    const [linkedOwnerId, setLinkedOwnerId] = useState("");
    const [linkedOwnerName, setLinkedOwnerName] = useState("");
    const [linkBusy, setLinkBusy] = useState(false);
    const [linkMessage, setLinkMessage] = useState("");
    const [linkError, setLinkError] = useState("");
    const [trackerStatus, setTrackerStatus] = useState<{
        lastSeenAt: string | null;
        latestVersion: string;
        trackerVersion: string;
        updateNeeded: boolean;
    } | null>(null);

    useEffect(() => {
        if (!auth) {
            setAuthReady(true);
            return;
        }

        return onAuthStateChanged(auth, (nextUser) => {
            setUser(nextUser);
            setName(nextUser?.displayName ?? "");
            setAuthReady(true);
        });
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        setViewerOs(detectOsFromNavigator());
    }, []);

    useEffect(() => {
        if (!db || (!linkedOwnerId && !user?.displayName?.trim())) {
            setUsageRows([]);
            return;
        }

        return onSnapshot(
            query(
                collection(db, "usageDailySummaries"),
                where(
                    linkedOwnerId ? "ownerId" : "ownerName",
                    "==",
                    linkedOwnerId || user?.displayName?.trim() || "",
                ),
                limit(365),
            ),
            (snapshot) => {
                setUsageRows(
                    snapshot.docs
                        .map((item) => mapSummary(item.id, item.data()))
                        .sort(
                            (a, b) =>
                                (toDate(b.lastCompletedAt)?.getTime() ?? 0) -
                                (toDate(a.lastCompletedAt)?.getTime() ?? 0),
                        ),
                );
            },
        );
    }, [linkedOwnerId, user?.displayName]);

    useEffect(() => {
        if (!user) {
            setLinkedOwnerId("");
            setLinkedOwnerName("");
            setLinkOwnerId("");
            return;
        }

        const currentUser = user;

        async function loadLinkState() {
            const token = await currentUser.getIdToken();
            const response = await fetch("/api/account/tracker-link", {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                return;
            }

            const payload = (await response.json()) as {
                linkedOwnerId?: string;
                linkedOwnerName?: string;
                trackerStatus?: {
                    lastSeenAt: string | null;
                    latestVersion: string;
                    trackerVersion: string;
                    updateNeeded: boolean;
                } | null;
            };
            setLinkedOwnerId(payload.linkedOwnerId ?? "");
            setLinkedOwnerName(payload.linkedOwnerName ?? "");
            setLinkOwnerId(payload.linkedOwnerId ?? "");
            setTrackerStatus(payload.trackerStatus ?? null);
        }

        void loadLinkState();
    }, [user]);

    const passwordProviderEnabled = Boolean(
        user?.providerData.some(
            (provider) => provider.providerId === "password",
        ),
    );
    const recent7dKeys = useMemo(() => new Set(recentDateKeys(7)), []);
    const recent30dKeys = useMemo(() => new Set(recentDateKeys(30)), []);
    const usageSummary = useMemo(() => {
        const active7d = usageRows
            .filter((item) => recent7dKeys.has(item.dateKey))
            .reduce((sum, item) => sum + activeTokenCount(item), 0);
        const active30d = usageRows
            .filter((item) => recent30dKeys.has(item.dateKey))
            .reduce((sum, item) => sum + activeTokenCount(item), 0);
        const sessions30d = usageRows
            .filter((item) => recent30dKeys.has(item.dateKey))
            .reduce((sum, item) => sum + item.sessions, 0);
        const events30d = usageRows
            .filter((item) => recent30dKeys.has(item.dateKey))
            .reduce((sum, item) => sum + item.events, 0);
        const latest = usageRows[0] ?? null;

        return {
            active7d,
            active30d,
            sessions30d,
            events30d,
            latest,
        };
    }, [recent30dKeys, recent7dKeys, usageRows]);
    const reportCommand = reportCommandFor(viewerOs);
    const active7dText = formatNumber(usageSummary.active7d);
    const active30dText = formatNumber(usageSummary.active30d);
    const sessions30dText = formatNumber(usageSummary.sessions30d);
    const events30dText = formatNumber(usageSummary.events30d);

    async function submitProfile(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setProfileMessage("");
        setProfileError("");

        try {
            if (!user) {
                throw new Error("로그인한 계정이 없습니다.");
            }

            await updateProfile(user, {
                displayName: name.trim(),
            });
            await syncUserProfile(user);
            setProfileMessage("이름이 업데이트되었습니다.");
        } catch (error) {
            setProfileError(readableAccountError(error));
        }
    }

    async function submitPassword(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setPasswordMessage("");
        setPasswordError("");

        try {
            if (!user || !user.email) {
                throw new Error("이메일 계정이 연결되어 있지 않습니다.");
            }

            if (!passwordProviderEnabled) {
                throw new Error(
                    "현재 계정은 이메일/비밀번호 로그인을 사용하지 않습니다.",
                );
            }

            const credential = EmailAuthProvider.credential(
                user.email,
                currentPassword,
            );

            await reauthenticateWithCredential(user, credential);
            await updatePassword(user, newPassword);
            setCurrentPassword("");
            setNewPassword("");
            setPasswordMessage("비밀번호가 변경되었습니다.");
        } catch (error) {
            setPasswordError(readableAccountError(error));
        }
    }

    async function copyReportCommand() {
        try {
            await navigator.clipboard.writeText(reportCommand);
            setCommandCopied(true);
            window.setTimeout(() => setCommandCopied(false), 1400);
        } catch {
            setCommandCopied(false);
        }
    }

    async function linkTrackerOwner(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!user) {
            return;
        }

        setLinkBusy(true);
        setLinkMessage("");
        setLinkError("");

        try {
            const token = await user.getIdToken();
            const response = await fetch("/api/account/tracker-link", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    ownerId: linkOwnerId.trim(),
                }),
            });
            const payload = (await response.json()) as {
                error?: string;
                linkedOwnerId?: string;
                linkedOwnerName?: string;
                updatedUsageDocs?: number;
            };
            if (!response.ok) {
                throw new Error(payload.error || "트래커 연결에 실패했습니다.");
            }
            setLinkedOwnerId(payload.linkedOwnerId ?? "");
            setLinkedOwnerName(payload.linkedOwnerName ?? "");
            setLinkOwnerId(payload.linkedOwnerId ?? "");
            setTrackerStatus(null);
            setLinkMessage(
                `tracker 연결 완료: ${payload.linkedOwnerName ?? payload.linkedOwnerId} · usage ${payload.updatedUsageDocs ?? 0}건 반영`,
            );
        } catch (error) {
            setLinkError(readableAccountError(error));
        } finally {
            setLinkBusy(false);
        }
    }

    async function unlinkTrackerOwner() {
        if (!user) {
            return;
        }

        setLinkBusy(true);
        setLinkMessage("");
        setLinkError("");

        try {
            const token = await user.getIdToken();
            const response = await fetch("/api/account/tracker-link", {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            const payload = (await response.json()) as {
                error?: string;
                updatedUsageDocs?: number;
            };
            if (!response.ok) {
                throw new Error(payload.error || "연결 해제에 실패했습니다.");
            }
            setLinkedOwnerId("");
            setLinkedOwnerName("");
            setLinkOwnerId("");
            setTrackerStatus(null);
            setLinkMessage(
                `tracker 연결 해제 완료 · usage ${payload.updatedUsageDocs ?? 0}건 정리`,
            );
        } catch (error) {
            setLinkError(readableAccountError(error));
        } finally {
            setLinkBusy(false);
        }
    }

    async function handleSignOut() {
        if (!auth) {
            router.push("/");
            return;
        }

        await signOut(auth);
        router.push("/");
    }

    return (
        <main className="page narrow-page">
            <section className="section-heading">
                <p className="eyebrow">Account</p>
                <h1>계정</h1>
                <p>대시보드 접근 상태와 로그인 정보를 확인합니다.</p>
            </section>

            <section className="summary-grid">
                <article className="metric">
                    <span>my active 7d</span>
                    <strong className={metricValueClass(active7dText)}>
                        {active7dText}
                    </strong>
                    <small>최근 7일 active token</small>
                </article>
                <article className="metric">
                    <span>my active 30d</span>
                    <strong className={metricValueClass(active30dText)}>
                        {active30dText}
                    </strong>
                    <small>최근 30일 active token</small>
                </article>
                <article className="metric">
                    <span>sessions 30d</span>
                    <strong className={metricValueClass(sessions30dText)}>
                        {sessions30dText}
                    </strong>
                    <small>최근 30일 세션 수</small>
                </article>
                <article className="metric">
                    <span>events 30d</span>
                    <strong className={metricValueClass(events30dText)}>
                        {events30dText}
                    </strong>
                    <small>최근 30일 응답 수</small>
                </article>
                <article className="metric">
                    <span>last sync</span>
                    <strong>
                        {usageSummary.latest
                            ? (
                                  toDate(
                                      usageSummary.latest.lastCompletedAt,
                                  ) ?? new Date()
                              ).toLocaleTimeString("ko-KR")
                            : "-"}
                    </strong>
                    <small>
                        {usageSummary.latest
                            ? (
                                  toDate(
                                      usageSummary.latest.lastCompletedAt,
                                  ) ?? new Date()
                              ).toLocaleDateString("ko-KR")
                            : "트래커 기록 없음"}
                    </small>
                </article>
            </section>

            <section className="settings-list">
                <article className="settings-row">
                    <Mail size={22} />
                    <div>
                        <h2>이메일</h2>
                        <p>{user?.email ?? "아직 연결된 계정이 없습니다."}</p>
                    </div>
                </article>
                <article className="settings-row">
                    <UserRound size={22} />
                    <div>
                        <h2>이름</h2>
                        <p>
                            {user?.displayName ??
                                "아직 설정된 이름이 없습니다."}
                        </p>
                    </div>
                </article>
                <article className="settings-row">
                    <Link2 size={22} />
                    <div>
                        <h2>트래커 연결</h2>
                        <p>
                            터미널 리포트의 ownerId를 연결하면 웹 계정과 사용량이
                            정확하게 묶입니다.
                        </p>
                        <div className="copy-command" style={{ marginTop: 14 }}>
                            <code>{reportCommand}</code>
                            <button
                                className={`copy-command-button${commandCopied ? " is-copied" : ""}`}
                                type="button"
                                onClick={copyReportCommand}
                            >
                                <Copy size={16} />
                                {commandCopied ? "복사됨" : "복사"}
                            </button>
                        </div>
                        <form
                            className="auth-form"
                            style={{ marginTop: 14 }}
                            onSubmit={linkTrackerOwner}
                        >
                            <label>
                                <span>ownerId</span>
                                <input
                                    className="input"
                                    type="text"
                                    value={linkOwnerId}
                                    onChange={(event) =>
                                        setLinkOwnerId(event.target.value)
                                    }
                                    placeholder="owner-xxxxxxxx"
                                />
                            </label>
                            {linkedOwnerId ? (
                                <div className="notice">
                                    연결됨:{" "}
                                    <strong>
                                        {linkedOwnerName || linkedOwnerId}
                                    </strong>{" "}
                                    · {linkedOwnerId}
                                </div>
                            ) : (
                                <div className="notice">
                                    먼저 터미널에서 `--report`를 실행해 ownerId를
                                    확인한 뒤 붙여 넣으세요.
                                </div>
                            )}
                            {trackerStatus ? (
                                <div className="page-actions">
                                    <span className="live">
                                        {trackerStatus.lastSeenAt ? (
                                            <RefreshCw size={14} />
                                        ) : (
                                            <TriangleAlert size={14} />
                                        )}
                                        {trackerStatus.lastSeenAt
                                            ? new Date(
                                                  trackerStatus.lastSeenAt,
                                              ).toLocaleString("ko-KR")
                                            : "업로드 기록 없음"}
                                    </span>
                                    <span className="live">
                                        {trackerStatus.updateNeeded ? (
                                            <Wrench size={14} />
                                        ) : (
                                            <CheckCircle2 size={14} />
                                        )}
                                        {trackerStatus.trackerVersion
                                            ? `${trackerStatus.trackerVersion} / ${trackerStatus.latestVersion}`
                                            : "버전 미보고"}
                                    </span>
                                </div>
                            ) : null}
                            {linkError ? (
                                <div className="error">{linkError}</div>
                            ) : null}
                            {linkMessage ? (
                                <div className="notice">{linkMessage}</div>
                            ) : null}
                            <div className="page-actions">
                                <button
                                    className="button"
                                    type="submit"
                                    disabled={linkBusy}
                                >
                                    {linkBusy ? "연결 중..." : "트래커 연결"}
                                </button>
                                {linkedOwnerId ? (
                                    <button
                                        className="button secondary"
                                        type="button"
                                        disabled={linkBusy}
                                        onClick={unlinkTrackerOwner}
                                    >
                                        연결 해제
                                    </button>
                                ) : null}
                            </div>
                        </form>
                    </div>
                </article>
                <article className="settings-row">
                    <TerminalSquare size={22} />
                    <div>
                        <h2>내 사용량 바로 보기</h2>
                        <p>
                            터미널에서 한 줄로 내 사용량 리포트를 바로 확인할 수
                            있습니다.
                        </p>
                        <div className="copy-command" style={{ marginTop: 14 }}>
                            <code>{reportCommand}</code>
                            <button
                                className={`copy-command-button${commandCopied ? " is-copied" : ""}`}
                                type="button"
                                onClick={copyReportCommand}
                            >
                                <Copy size={16} />
                                {commandCopied ? "복사됨" : "복사"}
                            </button>
                        </div>
                        <div className="page-actions" style={{ marginTop: 12 }}>
                            <Link className="button secondary" href="/dashboard">
                                <Activity size={18} />
                                대시보드 보기
                            </Link>
                        </div>
                        <div className="notice" style={{ marginTop: 12 }}>
                            {linkedOwnerId
                                ? `현재 ${linkedOwnerName || linkedOwnerId} tracker owner와 연결되어 있습니다.`
                                : "아직 ownerId 연결 전이라 이름 기준으로 사용량을 찾고 있습니다."}
                        </div>
                    </div>
                </article>
            </section>

            {user ? (
                <section className="settings-forms">
                    <article className="auth-panel settings-panel">
                        <p className="eyebrow">Profile</p>
                        <h2>이름 변경</h2>
                        <form className="auth-form" onSubmit={submitProfile}>
                            <label>
                                <span>표시 이름</span>
                                <input
                                    className="input"
                                    type="text"
                                    value={name}
                                    onChange={(event) =>
                                        setName(event.target.value)
                                    }
                                    required
                                />
                            </label>
                            {profileError ? (
                                <div className="error">{profileError}</div>
                            ) : null}
                            {profileMessage ? (
                                <div className="notice">{profileMessage}</div>
                            ) : null}
                            <button className="button" type="submit">
                                이름 저장
                            </button>
                        </form>
                    </article>

                    <article className="auth-panel settings-panel">
                        <p className="eyebrow">Security</p>
                        <h2>비밀번호 변경</h2>
                        {passwordProviderEnabled ? (
                            <form
                                className="auth-form"
                                onSubmit={submitPassword}
                            >
                                <label>
                                    <span>현재 비밀번호</span>
                                    <input
                                        className="input"
                                        type="password"
                                        value={currentPassword}
                                        onChange={(event) =>
                                            setCurrentPassword(
                                                event.target.value,
                                            )
                                        }
                                        required
                                    />
                                </label>
                                <label>
                                    <span>새 비밀번호</span>
                                    <input
                                        className="input"
                                        type="password"
                                        value={newPassword}
                                        onChange={(event) =>
                                            setNewPassword(event.target.value)
                                        }
                                        minLength={6}
                                        required
                                    />
                                </label>
                                {passwordError ? (
                                    <div className="error">{passwordError}</div>
                                ) : null}
                                {passwordMessage ? (
                                    <div className="notice">
                                        {passwordMessage}
                                    </div>
                                ) : null}
                                <button className="button" type="submit">
                                    비밀번호 변경
                                </button>
                            </form>
                        ) : (
                            <div className="notice">
                                현재 계정은 외부 로그인으로 연결되어 있어
                                <br />
                                비밀번호 변경이 제공되지 않습니다.
                            </div>
                        )}
                    </article>
                </section>
            ) : null}

            <div className="page-actions">
                {user ? (
                    <button
                        className="button secondary"
                        type="button"
                        onClick={handleSignOut}
                    >
                        <LogOut size={18} />
                        로그아웃
                    </button>
                ) : (
                    <Link className="button" href="/login">
                        로그인/회원가입
                    </Link>
                )}
            </div>
        </main>
    );
}
