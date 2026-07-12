import { readFile } from "node:fs/promises";
import { join } from "node:path";

const TRACKER_WRITE_TOKEN_PLACEHOLDER = "__AGENT_TRACKER_WRITE_TOKEN__";
const TRACKER_UPLOAD_URL_PLACEHOLDER = "__AGENT_TRACKER_UPLOAD_URL__";
const TRACKER_VERSION_PLACEHOLDER = "__AGENT_TRACKER_VERSION__";
const TRACKER_VERSION = "0.4.0";

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env value: ${name}`);
  }
  return value;
}

export async function renderTrackerAsset(
  relativePath: string,
  options: { baseUrl: string },
) {
  const source = await readFile(
    join(process.cwd(), "public", "tracker", relativePath),
    "utf8",
  );

  const replacements = [
    [TRACKER_UPLOAD_URL_PLACEHOLDER, `${options.baseUrl}/api/track/sync`],
    [TRACKER_WRITE_TOKEN_PLACEHOLDER, requireEnv("TRACKER_WRITE_TOKEN")],
    [TRACKER_VERSION_PLACEHOLDER, TRACKER_VERSION],
  ] as const;

  let rendered = source;
  for (const [placeholder, value] of replacements) {
    if (!rendered.includes(placeholder)) {
      throw new Error(
        `Tracker asset ${relativePath} is missing placeholder ${placeholder}.`,
      );
    }
    rendered = rendered.replaceAll(placeholder, value);
  }

  return rendered;
}
