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
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signInWithPopup,
    signOut,
    GoogleAuthProvider,
    type User,
} from "firebase/auth";
import {
    LogOut,
    Radio,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { auth, db, hasFirebaseConfig } from "@/lib/firebase";
import {
    formatNumber,
    summarizeByAgent,
    summarizeByOwner,
    toDate,
    type UsageEvent,
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

function osLabel(os: OsKind) {
    if (os === "windows") {
        return "Windows VSCode 터미널";
    }
    if (os === "macos") {
        return "macOS 터미널";
    }
    return "Python 설치형";
}

function mapEvent(id: string, data: DocumentData): UsageEvent {
    return {
        id,
        agent: data.agent ?? "unknown",
        ownerName: data.ownerName ?? "unassigned",
        authUid: data.authUid ?? "",
        authEmail: data.authEmail ?? "",
        sessionId: data.sessionId ?? "",
        sessionName: data.sessionName ?? "",
        responseId: data.responseId ?? id,
        inputTokens: Number(data.inputTokens ?? 0),
        cachedTokens: Number(data.cachedTokens ?? 0),
        outputTokens: Number(data.outputTokens ?? 0),
        reasoningTokens: Number(data.reasoningTokens ?? 0),
        totalTokens: Number(data.totalTokens ?? 0),
        model: data.model ?? "",
        source: data.source ?? "codex-local-log",
        completedAt: data.completedAt ?? null,
        syncedAt: data.syncedAt ?? null,
    };
}

function readableAuthError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("auth/operation-not-allowed")) {
        return "Firebase Console > Authentication > Sign-in method에서 Email/Password 또는 Google provider를 켜야 합니다.";
    }
    if (message.includes("auth/unauthorized-domain")) {
        return "Firebase Authentication의 Authorized domains에 현재 도메인을 추가해야 합니다.";
    }
    if (message.includes("auth/weak-password")) {
        return "비밀번호는 최소 6자 이상이어야 합니다.";
    }
    if (message.includes("auth/email-already-in-use")) {
        return "이미 가입된 이메일입니다. 기존 계정으로 로그인해 주세요.";
    }
    if (message.includes("auth/invalid-credential")) {
        return "이메일 또는 비밀번호가 맞지 않습니다.";
    }

    return message || "인증에 실패했습니다.";
}

export default function Home() {
    const [user, setUser] = useState<User | null>(null);
    const [authReady, setAuthReady] = useState(false);
    const [events, setEvents] = useState<UsageEvent[]>([]);
    const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
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
            setEvents([]);
            return;
        }

        const usageQuery = query(
            collection(db, "usageEvents"),
            orderBy("completedAt", "desc"),
            limit(200),
        );

        return onSnapshot(usageQuery, (snapshot) => {
            setEvents(snapshot.docs.map((doc) => mapEvent(doc.id, doc.data())));
        });
    }, [user]);

    async function submitEmailAuth(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");

        try {
            if (!auth) {
                throw new Error("Firebase Auth 설정이 필요합니다.");
            }
            if (authMode === "signup") {
                await createUserWithEmailAndPassword(auth, email, password);
            } else {
                await signInWithEmailAndPassword(auth, email, password);
            }
        } catch (authError) {
            setError(readableAuthError(authError));
        }
    }

    async function signInGoogle() {
        setError("");
        try {
            if (!auth) {
                throw new Error("Firebase Auth 설정이 필요합니다.");
            }
            await signInWithPopup(auth, new GoogleAuthProvider());
        } catch (authError) {
            setError(readableAuthError(authError));
        }
    }

    const summary = summarizeByOwner(events);
    const agentSummary = summarizeByAgent(events);
    const totalTokens = events.reduce(
        (sum, event) => sum + event.totalTokens,
        0,
    );
    const totalSessions = new Set(events.map((event) => event.sessionId)).size;
    const lastEventDate = toDate(events[0]?.completedAt ?? null);

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
                    <p className="eyebrow">Team dashboard</p>
                    <h1>Agent Usage Tracker</h1>
                    <p>
                        Firebase Auth로 로그인하면 팀 전체 Codex와 Claude Code
                        사용량을 실시간으로 볼 수 있습니다.
                    </p>

                    <form className="auth-form" onSubmit={submitEmailAuth}>
                        <input
                            className="input"
                            placeholder="email"
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            required
                        />
                        <input
                            className="input"
                            placeholder="password"
                            type="password"
                            value={password}
                            onChange={(event) =>
                                setPassword(event.target.value)
                            }
                            required
                        />
                        {error ? <div className="error">{error}</div> : null}
                        <button className="button" type="submit">
                            {authMode === "signin" ? "로그인" : "계정 만들기"}
                        </button>
                    </form>

                    <button
                        className="button secondary"
                        type="button"
                        onClick={signInGoogle}
                    >
                        Google로 계속하기
                    </button>
                    <button
                        className="button ghost"
                        type="button"
                        onClick={() =>
                            setAuthMode(
                                authMode === "signin" ? "signup" : "signin",
                            )
                        }
                    >
                        {authMode === "signin"
                            ? "새 계정 만들기"
                            : "기존 계정으로 로그인"}
                    </button>
                </section>
            </main>
        );
    }

    return (
        <main className="page">
            <header className="topbar">
                <div className="brand">
                    <div className="mark">
                        <Radio size={24} />
                    </div>
                    <div>
                        <p className="eyebrow">Realtime agent telemetry</p>
                        <h1>Agent Usage Tracker</h1>
                    </div>
                </div>
                <div className="userbar">
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

            <section className="hero-grid">
                <div className="summary-grid">
                    <article className="metric">
                        <span>total tokens</span>
                        <strong>{formatNumber(totalTokens)}</strong>
                        <small>최근 200개 이벤트 기준</small>
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
                        <small>Codex thread_id / Claude sessionId 기준</small>
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
                </div>

                <aside className="command-panel">
                    <div>
                        <div className="command-heading">
                            <h2>터미널 워처</h2>
                            <span>{osLabel(os)}</span>
                        </div>
                        <p>
                            각 사용자 VSCode 터미널에서 아래 한 줄을 실행하면
                            로컬 Codex와 Claude Code 로그가 Firestore로
                            올라갑니다.
                        </p>
                    </div>
                    <pre className="command">{installCommand(os)}</pre>
                    <p className="command-note">
                        첫 실행 때 이름을 물어보고, 이후 같은 프로젝트에서는
                        저장된 이름으로 추적합니다.
                    </p>
                </aside>
            </section>

            <section className="content-grid">
                <article className="panel">
                    <div className="panel-header">
                        <h2>사용자 순위</h2>
                        <span className="live">live</span>
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
                                            {formatNumber(item.events)} events
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

                <article className="table-panel">
                    <table>
                        <thead>
                            <tr>
                                <th>시간</th>
                                <th>Agent</th>
                                <th>사용자</th>
                                <th>세션</th>
                                <th>토큰</th>
                            </tr>
                        </thead>
                        <tbody>
                            {events.length ? (
                                events.slice(0, 12).map((event) => {
                                    const completedAt = toDate(
                                        event.completedAt,
                                    );
                                    return (
                                        <tr key={event.id}>
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
                                                    className={`agent-pill ${event.agent}`}
                                                >
                                                    {event.agent}
                                                </span>
                                            </td>
                                            <td>{event.ownerName}</td>
                                            <td className="mono">
                                                {event.sessionId || "-"}
                                            </td>
                                            <td>
                                                {formatNumber(
                                                    event.totalTokens,
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td className="empty" colSpan={5}>
                                        워처를 실행하면 여기에 이벤트가
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
