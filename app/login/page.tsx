"use client";

import {
    createUserWithEmailAndPassword,
    GoogleAuthProvider,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signInWithPopup,
    updateProfile,
    type User,
} from "firebase/auth";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { auth, hasFirebaseConfig } from "@/lib/firebase";
import styles from "./login.module.css";

function GoogleMark() {
    return (
        <svg
            aria-hidden="true"
            className={styles.googleMark}
            viewBox="0 0 24 24"
        >
            <path
                d="M21.805 12.23c0-.77-.069-1.508-.198-2.215H12v4.19h5.487a4.694 4.694 0 0 1-2.036 3.08v2.56h3.294c1.928-1.776 3.06-4.396 3.06-7.615Z"
                fill="#4285F4"
            />
            <path
                d="M12 22c2.76 0 5.074-.915 6.765-2.476l-3.294-2.56c-.914.613-2.083.975-3.47.975-2.668 0-4.928-1.8-5.734-4.22H2.86v2.64A10 10 0 0 0 12 22Z"
                fill="#34A853"
            />
            <path
                d="M6.266 13.72A5.993 5.993 0 0 1 5.945 12c0-.597.108-1.176.32-1.72V7.64H2.86A10 10 0 0 0 2 12c0 1.61.385 3.135 1.06 4.36l3.206-2.64Z"
                fill="#FBBC05"
            />
            <path
                d="M12 6.061c1.501 0 2.85.516 3.912 1.53l2.934-2.935C17.07 2.992 14.756 2 12 2A10 10 0 0 0 2.86 7.64l3.406 2.64C7.072 7.861 9.332 6.061 12 6.061Z"
                fill="#EA4335"
            />
        </svg>
    );
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

export default function LoginPage() {
    const router = useRouter();
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

        return onAuthStateChanged(auth, (nextUser) => {
            setUser(nextUser);
            if (nextUser) {
                router.replace("/dashboard");
            }
        });
    }, [router]);

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
            <section className={`auth-panel ${styles.loginPanel}`}>
                <p className="eyebrow">
                    {authMode === "signin" ? "Login" : "Sign Up"}
                </p>
                <h1>{authMode === "signin" ? "로그인" : "회원가입"}</h1>

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
                                onChange={(event) =>
                                    setName(event.target.value)
                                }
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
                    {user ? null : (
                        <button className="button" type="submit">
                            {authMode === "signin" ? "로그인" : "계정 만들기"}
                        </button>
                    )}
                </form>

                <div className={`auth-actions ${styles.actionRow}`}>
                    <button
                        className={`button secondary ${styles.googleButton}`}
                        type="button"
                        onClick={signInGoogle}
                    >
                        <GoogleMark />
                        Google로 계속하기
                    </button>
                    <button
                        className={`button secondary ${styles.switchButton}`}
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
