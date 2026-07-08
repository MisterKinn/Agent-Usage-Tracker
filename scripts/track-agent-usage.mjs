import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";

dotenv.config({ path: [".env.local", ".env"] });

const THREAD_RE = /thread(?:\.id|_id)=([0-9a-f-]{36})/;
const RUN_CONTEXT = process.cwd();
const ROOT = import.meta.dirname;
const TRACKER_UPLOAD_URL =
  process.env.AGENT_TRACKER_UPLOAD_URL?.trim() || "http://localhost:3000/api/track/sync";
const TRACKER_WRITE_TOKEN = process.env.TRACKER_WRITE_TOKEN?.trim() || "";
const DEFAULT_CODEX_DB = `${homedir()}/.codex/logs_2.sqlite`;
const DEFAULT_CODEX_SESSION_INDEX = `${homedir()}/.codex/session_index.jsonl`;
const DEFAULT_CLAUDE_PROJECTS_DIR = `${homedir()}/.claude/projects`;
const STATE_PATH = join(ROOT, ".tracker-state.json");
const GLOBAL_CONFIG_DIR = `${homedir()}/.agent-usage-tracker`;
const CONFIG_PATH = `${GLOBAL_CONFIG_DIR}/profile.json`;
const LEGACY_CONFIG_PATH = join(ROOT, ".tracker-config.json");

function readArgs(argv) {
  const args = {
    name: "",
    nameProvided: false,
    agent: "all",
    once: false,
    dryRun: false,
    sinceDays: 7,
    maxEvents: 200,
    allHistory: false,
    intervalMs: 8000,
    codexDbPath: DEFAULT_CODEX_DB,
    codexSessionIndexPath: DEFAULT_CODEX_SESSION_INDEX,
    claudeProjectsDir: DEFAULT_CLAUDE_PROJECTS_DIR,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--name") {
      args.name = argv[index + 1] ?? "";
      args.nameProvided = true;
      index += 1;
    } else if (arg.startsWith("--name=")) {
      args.name = arg.slice("--name=".length);
      args.nameProvided = true;
    } else if (arg === "--agent") {
      args.agent = argv[index + 1] ?? args.agent;
      index += 1;
    } else if (arg === "--once") {
      args.once = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
      args.once = true;
    } else if (arg === "--since-days") {
      args.sinceDays = Number(argv[index + 1] ?? args.sinceDays);
      index += 1;
    } else if (arg === "--max-events") {
      args.maxEvents = Number(argv[index + 1] ?? args.maxEvents);
      index += 1;
    } else if (arg === "--all-history") {
      args.allHistory = true;
      args.sinceDays = 0;
    } else if (arg === "--interval-ms") {
      args.intervalMs = Number(argv[index + 1] ?? args.intervalMs);
      index += 1;
    } else if (arg === "--codex-db") {
      args.codexDbPath = argv[index + 1] ?? args.codexDbPath;
      index += 1;
    } else if (arg === "--codex-session-index") {
      args.codexSessionIndexPath = argv[index + 1] ?? args.codexSessionIndexPath;
      index += 1;
    } else if (arg === "--claude-projects-dir") {
      args.claudeProjectsDir = argv[index + 1] ?? args.claudeProjectsDir;
      index += 1;
    }
  }

  if (!["all", "codex", "claude"].includes(args.agent)) {
    throw new Error("--agent must be one of: all, codex, claude");
  }

  args.name = args.name.trim();
  return args;
}

function readConfig() {
  if (existsSync(CONFIG_PATH)) {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  }

  if (existsSync(LEGACY_CONFIG_PATH)) {
    const legacy = JSON.parse(readFileSync(LEGACY_CONFIG_PATH, "utf8"));
    if (!String(legacy.ownerId ?? "").trim()) {
      legacy.ownerId = `owner-${randomUUID().replaceAll("-", "")}`;
    }
    writeConfig(legacy);
    return legacy;
  }

  return {};
}

function writeConfig(config) {
  if (!existsSync(GLOBAL_CONFIG_DIR)) {
    mkdirSync(GLOBAL_CONFIG_DIR, { recursive: true });
  }
  writeFileSync(`${CONFIG_PATH}.tmp`, JSON.stringify(config, null, 2), "utf8");
  renameSync(`${CONFIG_PATH}.tmp`, CONFIG_PATH);
}

async function resolveOwnerProfile(args) {
  if (!existsSync(CONFIG_PATH)) {
    if (existsSync(LEGACY_CONFIG_PATH)) {
      const legacy = JSON.parse(readFileSync(LEGACY_CONFIG_PATH, "utf8"));
      if (!String(legacy.ownerId ?? "").trim()) {
        legacy.ownerId = `owner-${randomUUID().replaceAll("-", "")}`;
      }
      writeConfig(legacy);
    }
  }
  const config = readConfig();
  const ownerId = String(config.ownerId ?? `owner-${randomUUID().replaceAll("-", "")}`).trim();

  if (args.name) {
    const nextConfig = {
      ...config,
      ownerName: args.name,
      ownerId,
      updatedAt: new Date().toISOString(),
    };
    writeConfig(nextConfig);
    console.log(`[agent-usage-tracker] saved owner name: ${args.name}`);
    return { ownerName: args.name, ownerId };
  }

  if (config.ownerName) {
    if (String(config.ownerId ?? "").trim() !== ownerId) {
      writeConfig({
        ...config,
        ownerId,
      });
    }
    return { ownerName: String(config.ownerName).trim(), ownerId };
  }

  const envName = process.env.AGENT_TRACKER_NAME?.trim();
  if (envName) {
    writeConfig({
      ...config,
      ownerName: envName,
      ownerId,
      updatedAt: new Date().toISOString(),
    });
    return { ownerName: envName, ownerId };
  }

  if (!process.stdin.isTTY) {
    throw new Error('Owner name is required. Run `npm run track -- --name "이름"` once first.');
  }

  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = (await readline.question("Agent 사용자 이름: ")).trim();
  readline.close();

  if (!answer) {
    throw new Error("Owner name is required.");
  }

  writeConfig({
    ...config,
    ownerName: answer,
    ownerId,
    updatedAt: new Date().toISOString(),
  });
  console.log(`[agent-usage-tracker] saved owner name: ${answer}`);
  return { ownerName: answer, ownerId };
}

function readState() {
  if (!existsSync(STATE_PATH)) {
    return { uploadedEventIds: [] };
  }

  const state = JSON.parse(readFileSync(STATE_PATH, "utf8"));
  return {
    ...state,
    uploadedEventIds: state.uploadedEventIds ?? state.uploadedResponseIds ?? [],
  };
}

function writeState(state) {
  writeFileSync(`${STATE_PATH}.tmp`, JSON.stringify(state, null, 2), "utf8");
  renameSync(`${STATE_PATH}.tmp`, STATE_PATH);
}

function readCodexSessionNames(sessionIndexPath) {
  if (!existsSync(sessionIndexPath)) {
    return new Map();
  }

  const names = new Map();
  const lines = readFileSync(sessionIndexPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    const item = JSON.parse(line);
    if (item.id) {
      names.set(item.id, item.thread_name ?? "");
    }
  }
  return names;
}

function queryCodexLogs(dbPath) {
  if (!existsSync(dbPath)) {
    return [];
  }

  const sql = `
    SELECT id, ts, target, feedback_log_body
    FROM logs
    WHERE target = 'codex_core::stream_events_utils'
       OR (
            target = 'log'
            AND (
              feedback_log_body LIKE '%"type":"response.completed"%'
              OR feedback_log_body LIKE '%thread_id=%'
              OR feedback_log_body LIKE '%thread.id=%'
            )
       )
    ORDER BY id ASC
  `;

  const output = execFileSync("sqlite3", ["-json", dbPath, sql], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  });

  return JSON.parse(output || "[]");
}

function nearestThreadId(recentThreads, eventTs) {
  for (let index = recentThreads.length - 1; index >= 0; index -= 1) {
    const item = recentThreads[index];
    if (eventTs - item.ts > 30) {
      break;
    }
    return item.threadId;
  }
  return "";
}

function parseCodexEvents(args) {
  const rows = queryCodexLogs(args.codexDbPath);
  const sessionNames = readCodexSessionNames(args.codexSessionIndexPath);
  const events = [];
  const recentThreads = [];

  for (const row of rows) {
    const body = row.feedback_log_body ?? "";
    const match = body.match(THREAD_RE);
    if (match) {
      recentThreads.push({ ts: Number(row.ts), threadId: match[1] });
      if (recentThreads.length > 200) {
        recentThreads.shift();
      }
    }

    if (
      row.target !== "log" ||
      !body.startsWith("Received message ") ||
      !body.includes('"type":"response.completed"') ||
      !body.includes('"usage":{')
    ) {
      continue;
    }

    const payload = JSON.parse(body.slice("Received message ".length));
    const response = payload.response ?? {};
    const usage = response.usage ?? {};
    if (!usage.total_tokens || !response.id) {
      continue;
    }

    const sessionId = nearestThreadId(recentThreads, Number(row.ts));
    const completedAtSeconds = Number(response.completed_at ?? row.ts);

    events.push({
      eventId: `codex:${response.id}`,
      agent: "codex",
      ownerName: args.name,
      ownerId: args.ownerId,
      sessionId,
      sessionName: sessionNames.get(sessionId) ?? "",
      responseId: response.id,
      inputTokens: Number(usage.input_tokens ?? 0),
      cachedTokens: Number(usage.input_tokens_details?.cached_tokens ?? 0),
      outputTokens: Number(usage.output_tokens ?? 0),
      reasoningTokens: Number(usage.output_tokens_details?.reasoning_tokens ?? 0),
      totalTokens: Number(usage.total_tokens ?? 0),
      model: response.model ?? "",
      completedAt: new Date(completedAtSeconds * 1000).toISOString(),
      source: "codex-local-log",
    });
  }

  return events;
}

function listClaudeJsonlFiles(projectsDir) {
  if (!existsSync(projectsDir)) {
    return [];
  }

  const files = [];
  for (const projectName of readdirSync(projectsDir)) {
    const projectPath = join(projectsDir, projectName);
    if (!statSync(projectPath).isDirectory()) {
      continue;
    }
    for (const fileName of readdirSync(projectPath)) {
      if (fileName.endsWith(".jsonl")) {
        files.push(join(projectPath, fileName));
      }
    }
  }
  return files;
}

function parseClaudeTimestamp(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function parseClaudeEvents(args) {
  const events = [];

  for (const filePath of listClaudeJsonlFiles(args.claudeProjectsDir)) {
    const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      const item = JSON.parse(line);
      const message = item.message ?? {};
      const usage = message.usage;
      if (item.type !== "assistant" || !usage || !message.id) {
        continue;
      }

      const inputTokens = Number(usage.input_tokens ?? 0);
      const cacheCreationTokens = Number(usage.cache_creation_input_tokens ?? 0);
      const cacheReadTokens = Number(usage.cache_read_input_tokens ?? 0);
      const outputTokens = Number(usage.output_tokens ?? 0);
      const totalTokens = inputTokens + cacheCreationTokens + cacheReadTokens + outputTokens;
      if (!totalTokens) {
        continue;
      }

      const sessionId = item.sessionId ?? filePath.split("/").pop()?.replace(".jsonl", "") ?? "";
      const completedAt = parseClaudeTimestamp(item.timestamp);

      events.push({
        eventId: `claude:${sessionId}:${message.id}`,
        agent: "claude",
        ownerName: args.name,
        ownerId: args.ownerId,
        sessionId,
        sessionName: item.cwd ?? "",
        responseId: message.id,
        inputTokens,
        cachedTokens: cacheReadTokens,
        cacheCreationTokens,
        outputTokens,
        reasoningTokens: 0,
        totalTokens,
        model: message.model ?? "",
        completedAt: completedAt.toISOString(),
        source: "claude-code-jsonl",
      });
    }
  }

  return events;
}

function collectEvents(args) {
  const events = [];
  if (args.agent === "all" || args.agent === "codex") {
    events.push(...parseCodexEvents(args));
  }
  if (args.agent === "all" || args.agent === "claude") {
    events.push(...parseClaudeEvents(args));
  }
  const cutoffMs = args.allHistory ? 0 : Date.now() - args.sinceDays * 24 * 60 * 60 * 1000;
  return events
    .filter((event) => new Date(event.completedAt).getTime() >= cutoffMs)
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
}

async function requestJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${TRACKER_WRITE_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? `Tracker upload failed (${response.status})`);
  }
  return payload;
}

async function syncOnce({ args, state }) {
  const uploaded = new Set(state.uploadedEventIds ?? []);
  const events = collectEvents(args)
    .filter((event) => !uploaded.has(event.eventId))
    .slice(0, args.maxEvents > 0 ? args.maxEvents : undefined);

  if (args.dryRun) {
    const counts = events.reduce((acc, event) => {
      acc[event.agent] = (acc[event.agent] ?? 0) + 1;
      return acc;
    }, {});
    const totalTokens = events.reduce((sum, event) => sum + event.totalTokens, 0);
    console.log(
      `[agent-usage-tracker] dry-run found ${events.length} uploadable event(s), totalTokens=${totalTokens}, counts=${JSON.stringify(counts)}, sinceDays=${args.allHistory ? "all" : args.sinceDays}, maxEvents=${args.maxEvents}`,
    );
    return;
  }

  if (events.length > 0) {
    await requestJson(TRACKER_UPLOAD_URL, {
      ownerId: args.ownerId,
      ownerName: args.name,
      agent: args.agent,
      workspacePath: RUN_CONTEXT,
      trackerPath: ROOT,
      trackerSource: "local-agent-log-node",
      events,
    });
  }

  for (const event of events) {
    uploaded.add(event.eventId);
  }

  state.uploadedEventIds = Array.from(uploaded).slice(-5000);
  state.lastSyncedAt = new Date().toISOString();
  writeState(state);

  const counts = events.reduce((acc, event) => {
    acc[event.agent] = (acc[event.agent] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `[agent-usage-tracker] synced ${events.length} new event(s) as ${args.name} ${JSON.stringify(counts)}`,
  );
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  const ownerProfile = await resolveOwnerProfile(args);
  args.name = ownerProfile.ownerName;
  args.ownerId = ownerProfile.ownerId;

  if (args.dryRun) {
    const state = readState();
    await syncOnce({ args, state });
    return;
  }

  if (!TRACKER_WRITE_TOKEN) {
    throw new Error("Missing TRACKER_WRITE_TOKEN. Set it in .env.local before running npm run track.");
  }

  const state = readState();

  if (args.once) {
    await syncOnce({ args, state });
    return;
  }

  console.log(`[agent-usage-tracker] watching local agent logs as ${args.name} (${args.agent})`);
  await syncOnce({ args, state });
  setInterval(() => {
    syncOnce({ args, state }).catch((error) => {
      console.error(`[agent-usage-tracker] ${explainError(error)}`);
    });
  }, args.intervalMs);
}

function explainError(error) {
  return error instanceof Error ? error.message : String(error);
}

main().catch((error) => {
  console.error(`[agent-usage-tracker] ${explainError(error)}`);
  process.exit(1);
});
