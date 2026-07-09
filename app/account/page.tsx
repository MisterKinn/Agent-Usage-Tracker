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
    Copy,
    LogOut,
    Mail,
    TerminalSquare,
    UserRound,
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
        if (!db || !user?.displayName?.trim()) {
            setUsageRows([]);
            return;
        }

        return onSnapshot(
            query(
                collection(db, "usageDailySummaries"),
                where("ownerName", "==", user.displayName.trim()),
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
    }, [user?.displayName]);

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
                            현재 로그인 이름과 로컬 트래커 이름이 같을 때 내
                            사용량 카드가 정확히 연결됩니다.
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
