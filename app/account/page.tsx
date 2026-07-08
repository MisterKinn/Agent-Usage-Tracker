"use client";

import Link from "next/link";
import {
    EmailAuthProvider,
    onAuthStateChanged,
    reauthenticateWithCredential,
    signOut,
    updatePassword,
    updateProfile,
    type User,
} from "firebase/auth";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogOut, Mail, ShieldCheck, UserRound } from "lucide-react";
import { auth, hasFirebaseConfig } from "@/lib/firebase";

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

    const passwordProviderEnabled = Boolean(
        user?.providerData.some(
            (provider) => provider.providerId === "password",
        ),
    );

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
                                현재 계정은 Google 등 외부 로그인으로 연결되어
                                있어 이메일 비밀번호 변경이 제공되지 않습니다.
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
