"use client";

import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import {
    getDownloadURL,
    ref,
    uploadBytes,
} from "firebase/storage";
import {
    FileImage,
    LifeBuoy,
    Mail,
    MessageSquareText,
    Send,
    Terminal,
} from "lucide-react";
import Link from "next/link";
import { onAuthStateChanged, type User } from "firebase/auth";
import { type ChangeEvent, FormEvent, useEffect, useState } from "react";
import { auth, db, hasFirebaseConfig, storage } from "@/lib/firebase";
import { detectVisitorEnvironment } from "@/lib/visitor";
import styles from "./contact.module.css";

type AttachmentDraft = {
    file: File;
    previewUrl?: string;
};

function formatFileSize(bytes: number) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ContactPage() {
    const [user, setUser] = useState<User | null>(null);
    const [subject, setSubject] = useState("");
    const [message, setMessage] = useState("");
    const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!auth) {
            return;
        }

        return onAuthStateChanged(auth, setUser);
    }, []);

    useEffect(() => {
        return () => {
            attachments.forEach((item) => {
                if (item.previewUrl) {
                    URL.revokeObjectURL(item.previewUrl);
                }
            });
        };
    }, [attachments]);

    function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
        const selected = Array.from(event.target.files ?? []);
        const limited = selected.slice(0, 5);

        setAttachments((current) => {
            current.forEach((item) => {
                if (item.previewUrl) {
                    URL.revokeObjectURL(item.previewUrl);
                }
            });

            return limited.map((file) => ({
                file,
                previewUrl: file.type.startsWith("image/")
                    ? URL.createObjectURL(file)
                    : undefined,
            }));
        });
    }

    function removeAttachment(index: number) {
        setAttachments((current) =>
            current.filter((item, itemIndex) => {
                if (itemIndex === index && item.previewUrl) {
                    URL.revokeObjectURL(item.previewUrl);
                }

                return itemIndex !== index;
            }),
        );
    }

    async function submitContact(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setStatus("");
        setError("");

        if (!user || !db) {
            setError("문의는 로그인 후 보낼 수 있습니다.");
            return;
        }
        if (!storage) {
            setError("Firebase Storage 설정이 필요합니다.");
            return;
        }
        const storageClient = storage;

        setSubmitting(true);

        try {
            const environment = detectVisitorEnvironment(
                window.navigator.userAgent,
            );
            const uploadedAttachments = await Promise.all(
                attachments.map(async ({ file }) => {
                    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
                    const storagePath = [
                        "contact-attachments",
                        user.uid,
                        `${Date.now()}-${safeName}`,
                    ].join("/");
                    const storageRef = ref(storageClient, storagePath);
                    await uploadBytes(storageRef, file, {
                        contentType: file.type || "application/octet-stream",
                    });
                    const downloadUrl = await getDownloadURL(storageRef);

                    return {
                        name: file.name,
                        path: storagePath,
                        size: file.size,
                        type: file.type || "application/octet-stream",
                        url: downloadUrl,
                    };
                }),
            );
            const docRef = await addDoc(collection(db, "contactMessages"), {
                attachments: uploadedAttachments,
                authEmail: user.email ?? "",
                authUid: user.uid,
                browser: environment.browser,
                createdAt: serverTimestamp(),
                deviceType: environment.deviceType,
                message: message.trim(),
                os: environment.os,
                ownerName: user.displayName ?? "",
                status: "new",
                subject: subject.trim(),
            });

            const notifyResponse = await fetch("/api/contact/notify", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    authEmail: user.email ?? "",
                    attachments: uploadedAttachments.map((item) => ({
                        name: item.name,
                        url: item.url,
                    })),
                    message: message.trim(),
                    messageId: docRef.id,
                    os: environment.os,
                    ownerName: user.displayName ?? "",
                    subject: subject.trim(),
                }),
            });

            if (!notifyResponse.ok) {
                console.warn("contact notify failed");
            }

            setSubject("");
            setMessage("");
            setAttachments((current) => {
                current.forEach((item) => {
                    if (item.previewUrl) {
                        URL.revokeObjectURL(item.previewUrl);
                    }
                });

                return [];
            });
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
                            <label>
                                <span>이미지 / 파일 첨부</span>
                                <div className={styles.attachmentField}>
                                    <input
                                        className={styles.fileInput}
                                        type="file"
                                        accept="image/*,.pdf,.txt,.log,.json,.md,.zip"
                                        multiple
                                        onChange={handleFileChange}
                                    />
                                    <div className={styles.attachmentHint}>
                                        최대 5개까지 첨부할 수 있습니다.
                                    </div>
                                </div>
                            </label>
                            {attachments.length ? (
                                <div className={styles.attachmentList}>
                                    {attachments.map((item, index) => (
                                        <div
                                            className={styles.attachmentItem}
                                            key={`${item.file.name}-${index}`}
                                        >
                                            <div className={styles.attachmentMeta}>
                                                {item.previewUrl ? (
                                                    <img
                                                        alt={item.file.name}
                                                        className={
                                                            styles.attachmentPreview
                                                        }
                                                        src={item.previewUrl}
                                                    />
                                                ) : (
                                                    <div
                                                        className={
                                                            styles.attachmentIcon
                                                        }
                                                    >
                                                        <FileImage size={16} />
                                                    </div>
                                                )}
                                                <div>
                                                    <strong>
                                                        {item.file.name}
                                                    </strong>
                                                    <span>
                                                        {formatFileSize(
                                                            item.file.size,
                                                        )}
                                                    </span>
                                                </div>
                                            </div>
                                            <button
                                                className="button secondary"
                                                type="button"
                                                onClick={() =>
                                                    removeAttachment(index)
                                                }
                                            >
                                                제거
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : null}
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
