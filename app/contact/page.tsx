import Link from "next/link";
import { LifeBuoy, Mail, MessageSquareText, Terminal } from "lucide-react";

export default function ContactPage() {
    return (
        <main className="page narrow-page">
            <nav className="site-nav compact">
                <Link className="brand-link" href="/">
                    Agent Usage Tracker
                </Link>
                <div className="nav-links">
                    <Link href="/dashboard">대시보드</Link>
                    <Link href="/account">계정</Link>
                </div>
            </nav>

            <section className="section-heading">
                <p className="eyebrow">Contact</p>
                <h1>문의</h1>
                <p>
                    설치, Firebase 연결, Claude Code/Codex 추적 누락 문제를
                    정리해서 보내주세요.
                </p>
            </section>

            <section className="contact-grid">
                <article className="feature-card">
                    <Mail size={22} />
                    <h2>이메일</h2>
                    <p>team@agent-usage-tracker.dev</p>
                </article>
                <article className="feature-card">
                    <MessageSquareText size={22} />
                    <h2>요청에 포함할 것</h2>
                    <p>OS, 설치 커맨드 실행 결과, Firebase 프로젝트 ID를 함께 보내면 빠르게 확인할 수 있습니다.</p>
                </article>
                <article className="feature-card">
                    <Terminal size={22} />
                    <h2>설치 명령</h2>
                    <p>/usr/bin/curl -fsSL 'https://agent-usage-tracker.vercel.app/api/install/python' | python3</p>
                </article>
                <article className="feature-card">
                    <LifeBuoy size={22} />
                    <h2>응답 범위</h2>
                    <p>대시보드 권한, 이벤트 동기화, 로컬 워처 실행 문제를 우선 지원합니다.</p>
                </article>
            </section>
        </main>
    );
}
