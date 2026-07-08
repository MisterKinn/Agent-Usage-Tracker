export type OsKind = "windows" | "macos";

const INSTALL_ORIGIN = "https://agent-usage-tracker.vercel.app";

export function detectOsFromNavigator(): OsKind {
    const userAgent = navigator.userAgent.toLowerCase();
    const platform = navigator.platform.toLowerCase();

    if (userAgent.includes("windows") || platform.includes("win")) {
        return "windows";
    }

    return "macos";
}

export function installCommandFor(os: OsKind) {
    if (os === "windows") {
        return `powershell -NoProfile -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create((irm '${INSTALL_ORIGIN}/api/install/windows')))"`;
    }

    return `/usr/bin/curl -fsSL '${INSTALL_ORIGIN}/api/install/python' | python3`;
}

export function rerunCommandFor(os: OsKind) {
    if (os === "windows") {
        return 'cd "$HOME/.agent-usage-tracker"; py -3 track_agent_usage.py';
    }

    return 'cd ~/.agent-usage-tracker && python3 track_agent_usage.py';
}
