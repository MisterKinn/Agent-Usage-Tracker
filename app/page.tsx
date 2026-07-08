import Link from "next/link";
import {
    ArrowRight,
    BarChart3,
    Command,
    ShieldCheck,
    Terminal,
    Users,
} from "lucide-react";

const MAC_COMMAND =
    "/usr/bin/curl -fsSL 'https://agent-usage-tracker.vercel.app/api/install/python' | python3";
const WINDOWS_COMMAND =
    "powershell -NoProfile -ExecutionPolicy Bypass -Command \"& ([scriptblock]::Create((irm 'https://agent-usage-tracker.vercel.app/api/install/windows')))\"";
const MAC_RERUN_COMMAND =
    'cd ".agent-usage-tracker" && python3 track_agent_usage.py';
const WINDOWS_RERUN_COMMAND =
    'cd .agent-usage-tracker && py -3 track_agent_usage.py';

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
        <main className="dark-home">
            <nav className="site-nav">
                <Link className="brand-link" href="/">
                    <Terminal size={18} />
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
                    <h1>Agent 사용량을 조용하게 추적하는 블랙 대시보드</h1>
                    <p>
                        Windows와 macOS 터미널에서 한 줄만 실행하면 Codex와
                        Claude Code 사용량이 실시간으로 모입니다.
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

                <div className="install-console" aria-label="install commands">
                    <article className="command-card featured">
                        <div>
                            <span>macOS / Linux</span>
                            <h2>터미널 설치</h2>
                        </div>
                        <code>{MAC_COMMAND}</code>
                        <p>다시 실행</p>
                        <code>{MAC_RERUN_COMMAND}</code>
                        <Terminal size={18} />
                    </article>
                    <article className="command-card">
                        <div>
                            <span>Windows</span>
                            <h2>PowerShell 설치</h2>
                        </div>
                        <code>{WINDOWS_COMMAND}</code>
                        <p>다시 실행</p>
                        <code>{WINDOWS_RERUN_COMMAND}</code>
                        <Terminal size={18} />
                    </article>
                    <div className="console-foot">
                        <Command size={16} />
                        <span>처음엔 설치 커맨드 · 이후엔 다시 실행 커맨드만 쓰면 됩니다</span>
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
