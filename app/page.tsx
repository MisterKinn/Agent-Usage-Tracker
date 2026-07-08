import Link from "next/link";
import {
    ArrowRight,
    BarChart3,
    CheckCircle2,
    Clock3,
    ShieldCheck,
    Terminal,
    Users,
} from "lucide-react";

const INSTALL_COMMAND =
    "/usr/bin/curl -fsSL 'https://agent-usage-tracker.vercel.app/api/install/python' | python3";

const highlights = [
    {
        icon: BarChart3,
        title: "Codex와 Claude Code를 한 화면에",
        body: "로컬 로그를 수집해 팀 단위 토큰 사용량, 세션 수, 최근 이벤트를 실시간으로 정리합니다.",
    },
    {
        icon: Users,
        title: "사용자별 비용 흐름",
        body: "프로젝트마다 누가 어떤 agent를 얼마나 쓰는지 순위를 바로 확인할 수 있습니다.",
    },
    {
        icon: ShieldCheck,
        title: "Firebase Auth 기반 접근",
        body: "대시보드는 로그인한 팀원에게만 열리고, 설치 워처는 Firestore로 안전하게 동기화합니다.",
    },
];

export default function Home() {
    return (
        <main>
            <section className="install-strip">
                <div className="install-strip-inner">
                    <Terminal size={18} />
                    <code>{INSTALL_COMMAND}</code>
                </div>
            </section>

            <nav className="site-nav">
                <Link className="brand-link" href="/">
                    Agent Usage Tracker
                </Link>
                <div className="nav-links">
                    <Link href="/dashboard">대시보드</Link>
                    <Link href="/account">계정</Link>
                    <Link href="/contact">문의</Link>
                    <Link className="nav-action" href="/login">
                        로그인
                    </Link>
                </div>
            </nav>

            <section className="landing-hero">
                <div className="landing-copy">
                    <p className="eyebrow">CLI-first usage telemetry</p>
                    <h1>Claude Code와 Codex 사용량을 팀 대시보드로 모읍니다</h1>
                    <p>
                        설치 커맨드 한 줄로 로컬 agent 로그를 연결하고, Next.js
                        대시보드에서 사용자별 토큰 흐름과 최근 세션을 바로
                        확인하세요.
                    </p>
                    <div className="hero-actions">
                        <Link className="button" href="/dashboard">
                            <BarChart3 size={18} />
                            대시보드 보기
                        </Link>
                        <Link className="button secondary" href="/login">
                            로그인/회원가입
                            <ArrowRight size={18} />
                        </Link>
                    </div>
                </div>

                <div className="product-panel" aria-label="usage dashboard preview">
                    <div className="preview-topline">
                        <span>live telemetry</span>
                        <strong>32.8M tokens</strong>
                    </div>
                    <div className="preview-bars">
                        <span style={{ height: "42%" }} />
                        <span style={{ height: "76%" }} />
                        <span style={{ height: "58%" }} />
                        <span style={{ height: "88%" }} />
                        <span style={{ height: "66%" }} />
                        <span style={{ height: "94%" }} />
                    </div>
                    <div className="preview-list">
                        <div>
                            <CheckCircle2 size={16} />
                            <span>codex · planning session</span>
                            <strong>184k</strong>
                        </div>
                        <div>
                            <Clock3 size={16} />
                            <span>claude · refactor session</span>
                            <strong>91k</strong>
                        </div>
                        <div>
                            <CheckCircle2 size={16} />
                            <span>codex · dashboard polish</span>
                            <strong>247k</strong>
                        </div>
                    </div>
                </div>
            </section>

            <section className="feature-grid">
                {highlights.map((item) => {
                    const Icon = item.icon;
                    return (
                        <article className="feature-card" key={item.title}>
                            <Icon size={22} />
                            <h2>{item.title}</h2>
                            <p>{item.body}</p>
                        </article>
                    );
                })}
            </section>
        </main>
    );
}
