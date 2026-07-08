"use client";

import Link from "next/link";
import { Terminal } from "lucide-react";
import { usePathname } from "next/navigation";

function isActive(pathname: string, href: string) {
    if (href === "/") {
        return pathname === href;
    }

    return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteNav() {
    const pathname = usePathname();

    return (
        <header className="site-nav-shell">
            <nav className="site-nav">
                <Link className="brand-link" href="/">
                    <Terminal size={18} />
                    Agent Usage Tracker
                </Link>
                <div className="nav-links">
                    <Link
                        className={isActive(pathname, "/dashboard") ? "active" : ""}
                        href="/dashboard"
                    >
                        대시보드
                    </Link>
                    <Link
                        className={isActive(pathname, "/guide") ? "active" : ""}
                        href="/guide"
                    >
                        설명서
                    </Link>
                    <Link
                        className={isActive(pathname, "/account") ? "active" : ""}
                        href="/account"
                    >
                        계정
                    </Link>
                    <Link
                        className={isActive(pathname, "/contact") ? "active" : ""}
                        href="/contact"
                    >
                        문의
                    </Link>
                    <Link className="nav-action" href="/login">
                        로그인
                    </Link>
                </div>
            </nav>
        </header>
    );
}
