import { headers } from "next/headers";

async function absoluteBaseUrl(requestUrl: string) {
    const headerStore = await headers();
    const forwardedProto = headerStore.get("x-forwarded-proto");
    const forwardedHost = headerStore.get("x-forwarded-host");
    const host = forwardedHost ?? headerStore.get("host");

    if (host) {
        return `${forwardedProto ?? "https"}://${host}`;
    }

    const url = new URL(requestUrl);
    return `${url.protocol}//${url.host}`;
}

export async function GET(request: Request) {
    const baseUrl = await absoluteBaseUrl(request.url);
    const script = `#!/usr/bin/env python3
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

BASE_URL = ${JSON.stringify(baseUrl)}
INSTALL_DIR = Path.cwd() / ".agent-usage-tracker"

def fail(message):
    print("[agent-usage-tracker] " + message, file=sys.stderr)
    raise SystemExit(1)

def download(pathname):
    url = BASE_URL + pathname
    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            return response.read().decode("utf-8")
    except Exception as urllib_error:
        try:
            result = subprocess.run(
                ["/usr/bin/curl", "-fsSL", url],
                check=True,
                capture_output=True,
                text=True,
            )
            return result.stdout
        except Exception as curl_error:
            fail(f"download failed: {pathname} (urllib={urllib_error}; curl={curl_error})")

def main():
    install_only = "--install-only" in sys.argv[1:]
    tracker_args = [arg for arg in sys.argv[1:] if arg != "--install-only"]

    INSTALL_DIR.mkdir(parents=True, exist_ok=True)
    (INSTALL_DIR / "track_agent_usage.py").write_text(download("/tracker/track_agent_usage.py"), encoding="utf-8")
    (INSTALL_DIR / ".env.local").write_text(download("/api/tracker-env"), encoding="utf-8")
    (INSTALL_DIR / ".gitignore").write_text(".env.local\\n.tracker-config.json\\n.tracker-state.json\\n", encoding="utf-8")

    print(f"[agent-usage-tracker] installed minimal Python tracker to {INSTALL_DIR}")

    if install_only:
        print("[agent-usage-tracker] install complete. Start with:")
        print(f'cd "{INSTALL_DIR}" && {sys.executable} track_agent_usage.py')
        return 0

    return subprocess.call([sys.executable, "track_agent_usage.py", *tracker_args], cwd=INSTALL_DIR)

raise SystemExit(main())
`;

    return new Response(script, {
        headers: {
            "cache-control": "no-store",
            "content-type": "text/x-python; charset=utf-8",
        },
    });
}
