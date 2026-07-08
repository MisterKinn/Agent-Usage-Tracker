import { readFile } from "node:fs/promises";
import { join } from "node:path";

const FIREBASE_ENV_MAP = {
  apiKey: "NEXT_PUBLIC_FIREBASE_API_KEY",
  authDomain: "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  projectId: "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  storageBucket: "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  appId: "NEXT_PUBLIC_FIREBASE_APP_ID",
} as const;

const FIREBASE_CONFIG_PLACEHOLDER = '"__AGENT_TRACKER_FIREBASE_CONFIG__"';

export function readFirebasePublicConfig() {
  const config = Object.fromEntries(
    Object.entries(FIREBASE_ENV_MAP).map(([key, envKey]) => [
      key,
      process.env[envKey] ?? "",
    ]),
  );

  const missing = Object.entries(FIREBASE_ENV_MAP)
    .filter(([, envKey]) => !process.env[envKey])
    .map(([, envKey]) => envKey);

  if (missing.length) {
    throw new Error(`Missing Firebase env values: ${missing.join(", ")}`);
  }

  return config;
}

export async function renderTrackerAsset(relativePath: string) {
  const source = await readFile(
    join(process.cwd(), "public", "tracker", relativePath),
    "utf8",
  );

  if (!source.includes(FIREBASE_CONFIG_PLACEHOLDER)) {
    throw new Error(
      `Tracker asset ${relativePath} is missing Firebase config placeholder.`,
    );
  }

  return source.replace(
    FIREBASE_CONFIG_PLACEHOLDER,
    JSON.stringify(readFirebasePublicConfig(), null, 2),
  );
}
