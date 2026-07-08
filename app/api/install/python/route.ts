import { headers } from "next/headers";
import { renderTrackerAsset } from "@/lib/tracker-installer";

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
    const trackerSource = await renderTrackerAsset("track_agent_usage.py", {
        baseUrl: await absoluteBaseUrl(request.url),
    });
    const script = `#!/usr/bin/env python3
import subprocess
import sys
from pathlib import Path

INSTALL_DIR = Path.home() / ".agent-usage-tracker"
TRACKER_SOURCE = ${JSON.stringify(trackerSource)}

def fail(message):
    print("[agent-usage-tracker] " + message, file=sys.stderr)
    raise SystemExit(1)

def main():
    install_only = "--install-only" in sys.argv[1:]
    tracker_args = [arg for arg in sys.argv[1:] if arg != "--install-only"]

    INSTALL_DIR.mkdir(parents=True, exist_ok=True)
    (INSTALL_DIR / "track_agent_usage.py").write_text(TRACKER_SOURCE, encoding="utf-8")
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
