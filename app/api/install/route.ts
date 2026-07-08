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
  const baseUrl = await absoluteBaseUrl(request.url);
  const trackerSource = await renderTrackerAsset("track-agent-usage.mjs", {
    baseUrl,
  });
  const installer = `#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import process from "node:process";

const BASE_URL = ${JSON.stringify(baseUrl)};
const INSTALL_DIR = join(homedir(), ".agent-usage-tracker");
const TRACKER_SOURCE = ${JSON.stringify(trackerSource)};
const FILES = [
  ["/tracker/package.json", "package.json"],
];

function fail(message) {
  console.error("[agent-usage-tracker] " + message);
  process.exit(1);
}

async function download(pathname) {
  const response = await fetch(BASE_URL + pathname, { cache: "no-store" });
  if (!response.ok) {
    fail("download failed: " + pathname + " (" + response.status + ")");
  }
  return response.text();
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
  if (result.status !== 0) {
    fail(command + " failed with exit code " + result.status);
  }
}

function trackerArgs(argv) {
  const args = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--install-only") {
      continue;
    }
    args.push(arg);
  }
  return args;
}

const installOnly = process.argv.includes("--install-only");

mkdirSync(INSTALL_DIR, { recursive: true });

for (const [remotePath, localPath] of FILES) {
  const targetPath = join(INSTALL_DIR, localPath);
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, await download(remotePath), "utf8");
}

writeFileSync(join(INSTALL_DIR, "track-agent-usage.mjs"), TRACKER_SOURCE, "utf8");

writeFileSync(
  join(INSTALL_DIR, ".gitignore"),
  ["node_modules", ".tracker-config.json", ".tracker-state.json", ""].join("\\n"),
  "utf8",
);

console.log("[agent-usage-tracker] installed minimal tracker to " + INSTALL_DIR);

if (!existsSync(join(INSTALL_DIR, "node_modules"))) {
  console.log("[agent-usage-tracker] installing tracker dependencies...");
  run("npm", ["install", "--silent"], { cwd: INSTALL_DIR });
}

if (installOnly) {
  console.log("[agent-usage-tracker] install complete. Start with: cd \\"" + INSTALL_DIR + "\\" && npm run track");
  process.exit(0);
}

const args = trackerArgs(process.argv.slice(2));
run("npm", ["run", "track", "--", ...args], { cwd: INSTALL_DIR });
`;

  return new Response(installer, {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/javascript; charset=utf-8",
    },
  });
}
