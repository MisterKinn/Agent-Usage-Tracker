"use client";

import Link from "next/link";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { KeyRound, LogOut, Mail, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { auth, hasFirebaseConfig } from "@/lib/firebase";

export default function AccountPage() {
    const [user, setUser] = useState<User | null>(null);
    const [authReady, setAuthReady] = useState(false);

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

    return (
        <main className="page narrow-page">
            <nav className="site-nav compact">
                <Link className="brand-link" href="/">
                    Agent Usage Tracker
                </Link>
                <div className="nav-links">
                    <Link href="/dashboard">대시보드</Link>
                    <Link href="/contact">문의</Link>
                </div>
            </nav>

            <section className="section-heading">
                <p className="eyebrow">Account</p>
                <h1>계정</h1>
                <p>대시보드 접근 상태와 로그인 정보를 확인합니다.</p>
            </section>

            <section className="settings-list">
                <article className="settings-row">
                    <ShieldCheck size={22} />
                    <div>
                        <h2>인증 상태</h2>
                        <p>
                            {!hasFirebaseConfig()
                                ? "Firebase 설정이 필요합니다."
                                : !authReady
                                  ? "확인 중..."
                                  : user
                                    ? "로그인됨"
                                    : "로그인 필요"}
                        </p>
                    </div>
                </article>
                <article className="settings-row">
                    <Mail size={22} />
                    <div>
                        <h2>이메일</h2>
                        <p>{user?.email ?? "아직 연결된 계정이 없습니다."}</p>
                    </div>
                </article>
                <article className="settings-row">
                    <KeyRound size={22} />
                    <div>
                        <h2>접근</h2>
                        <p>로그인한 계정은 실시간 사용량 대시보드에 접근할 수 있습니다.</p>
                    </div>
                </article>
            </section>

            <div className="page-actions">
                {user ? (
                    <button
                        className="button secondary"
                        type="button"
                        onClick={() => auth && signOut(auth)}
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
