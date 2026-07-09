"use client";

import { Send } from "lucide-react";
import Link from "next/link";
import { onAuthStateChanged, type User } from "firebase/auth";
import { type FormEvent, useEffect, useState } from "react";
import { auth, hasFirebaseConfig } from "@/lib/firebase";
import { detectVisitorEnvironment } from "@/lib/visitor";
import styles from "./contact.module.css";

export default function ContactPage() {
    const [user, setUser] = useState<User | null>(null);
    const [subject, setSubject] = useState("");
    const [message, setMessage] = useState("");
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!auth) {
            return;
        }

        return onAuthStateChanged(auth, setUser);
    }, []);

    async function submitContact(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setStatus("");
        setError("");

        if (!user || !auth) {
            setError("문의는 로그인 후 보낼 수 있습니다.");
            return;
        }

        setSubmitting(true);

        try {
            const environment = detectVisitorEnvironment(
                window.navigator.userAgent,
            );
            const idToken = await user.getIdToken();
            const formData = new FormData();
            formData.set("subject", subject.trim());
            formData.set("message", message.trim());
            formData.set("ownerName", user.displayName ?? "");
            formData.set("os", environment.os);
            formData.set("browser", environment.browser);
            formData.set("deviceType", environment.deviceType);

            const response = await fetch("/api/contact/submit", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${idToken}`,
                },
                body: formData,
            });

            if (!response.ok) {
                const payload = (await response
                    .json()
                    .catch(() => null)) as { error?: string } | null;
                throw new Error(
                    payload?.error || "문의를 저장하지 못했습니다.",
                );
            }

            setSubject("");
            setMessage("");
            setStatus("문의가 저장되었습니다.");
        } catch (nextError) {
            const message =
                nextError instanceof Error
                    ? nextError.message
                    : "문의를 저장하지 못했습니다.";
            setError(message);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <main className={`page ${styles.contactLayout}`}>
            <section className="section-heading">
                <p className="eyebrow">Contact</p>
                <h1>문의</h1>
                <p className={styles.lead}>
                    서비스를 사용하며 생긴 궁금증을 문의하세요.
                </p>
            </section>

            <section className={styles.contactShell}>
                <article className={`auth-panel ${styles.contactPanel}`}>
                    <p className="eyebrow">Support form</p>
                    <h2>문의 보내기</h2>
                    {!hasFirebaseConfig() ? (
                        <div className="notice">
                            Firebase 환경변수가 필요합니다. 먼저 `.env.local`
                            설정을 확인해 주세요.
                        </div>
                    ) : null}
                    {!user ? (
                        <div className="notice">
                            문의를 보내려면 먼저 로그인해야 합니다.
                            <div className="page-actions">
                                <Link className="button" href="/login">
                                    로그인/회원가입
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <form className="auth-form" onSubmit={submitContact}>
                            <label>
                                <span>제목</span>
                                <input
                                    className="input"
                                    type="text"
                                    value={subject}
                                    onChange={(event) =>
                                        setSubject(event.target.value)
                                    }
                                    placeholder="예: Claude Code 로그가 안 잡혀요"
                                    required
                                />
                            </label>
                            <label>
                                <span>문의 내용</span>
                                <textarea
                                    className={styles.textArea}
                                    value={message}
                                    onChange={(event) =>
                                        setMessage(event.target.value)
                                    }
                                    placeholder="문제 상황, 실행 결과, 실행 환경 등을 자세히 적어 주세요."
                                    required
                                />
                            </label>
                            <div className="notice">
                                이미지나 로그 파일이 있으면 Google Drive, Notion,
                                이미지 링크 등을 문의 내용에 함께 적어 주세요.
                            </div>
                            <div className={styles.accountBadge}>
                                <span className={styles.accountLabel}>
                                    현재 로그인 계정
                                </span>
                                <strong>{user.email ?? "unknown"}</strong>
                            </div>
                            {error ? (
                                <div className="error">{error}</div>
                            ) : null}
                            {status ? (
                                <div className="notice">{status}</div>
                            ) : null}
                            <button
                                className="button"
                                type="submit"
                                disabled={submitting}
                            >
                                <Send size={18} />
                                {submitting ? "보내는 중..." : "문의 보내기"}
                            </button>
                        </form>
                    )}
                </article>
            </section>
        </main>
    );
}
