"use client";

import Link from "next/link";
import {
    createUserWithEmailAndPassword,
    GoogleAuthProvider,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signInWithPopup,
    updateProfile,
    type User,
} from "firebase/auth";
import { ArrowRight, Github, Mail, UserRound } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { auth, hasFirebaseConfig } from "@/lib/firebase";

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

export default function LoginPage() {
    const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [user, setUser] = useState<User | null>(null);

    useEffect(() => {
        if (!auth) {
            return;
        }

        return onAuthStateChanged(auth, setUser);
    }, []);

    async function submitEmailAuth(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");

        try {
            if (!auth) {
                throw new Error("Firebase Auth 설정이 필요합니다.");
            }
            if (authMode === "signup") {
                const credential = await createUserWithEmailAndPassword(
                    auth,
                    email,
                    password,
                );

                if (name.trim()) {
                    await updateProfile(credential.user, {
                        displayName: name.trim(),
                    });
                }
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

    return (
        <main className="page auth-shell">
            <section className="auth-panel">
                <p className="eyebrow">Secure workspace</p>
                <h1>{authMode === "signin" ? "로그인" : "회원가입"}</h1>
                <p>
                    팀의 Codex와 Claude Code 사용량 대시보드에 접근하려면
                    계정이 필요합니다.
                </p>

                {!hasFirebaseConfig() ? (
                    <div className="notice">
                        `.env.local`에 Firebase Web App 환경변수를 먼저 설정해
                        주세요.
                    </div>
                ) : null}

                <form className="auth-form" onSubmit={submitEmailAuth}>
                    {authMode === "signup" ? (
                        <label>
                            <span>이름</span>
                            <input
                                className="input"
                                placeholder="팀에서 표시할 이름"
                                type="text"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                required
                            />
                        </label>
                    ) : null}
                    <label>
                        <span>이메일</span>
                        <input
                            className="input"
                            placeholder="you@company.com"
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            required
                        />
                    </label>
                    <label>
                        <span>비밀번호</span>
                        <input
                            className="input"
                            placeholder="6자 이상"
                            type="password"
                            value={password}
                            onChange={(event) =>
                                setPassword(event.target.value)
                            }
                            required
                        />
                    </label>
                    {error ? <div className="error">{error}</div> : null}
                    {user ? (
                        <Link className="button" href="/dashboard">
                            대시보드로 이동
                            <ArrowRight size={18} />
                        </Link>
                    ) : (
                        <button className="button" type="submit">
                            {authMode === "signin" ? (
                                <Mail size={18} />
                            ) : (
                                <UserRound size={18} />
                            )}
                            {authMode === "signin" ? "로그인" : "계정 만들기"}
                        </button>
                    )}
                </form>

                <div className="auth-actions">
                    <button
                        className="button secondary"
                        type="button"
                        onClick={signInGoogle}
                    >
                        <Github size={18} />
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
                </div>
            </section>
        </main>
    );
}
