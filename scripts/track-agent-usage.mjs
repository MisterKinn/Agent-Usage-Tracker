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
const TRACKER_VERSION = "0.4.0";
const TRACKER_REPORT_URL = TRACKER_UPLOAD_URL.replace(/\/sync$/, "/report");
const TRACKER_PROFILE_URL = TRACKER_UPLOAD_URL.replace(/\/sync$/, "/profile");
const TRACKER_VERSION_URL = TRACKER_UPLOAD_URL.replace(/\/sync$/, "/version");
const TRACKER_WRITE_TOKEN = process.env.TRACKER_WRITE_TOKEN?.trim() || "";
const DEFAULT_CODEX_DB = `${homedir()}/.codex/logs_2.sqlite`;
const DEFAULT_CODEX_SESSION_INDEX = `${homedir()}/.codex/session_index.jsonl`;
const DEFAULT_CODEX_SESSIONS_DIR = `${homedir()}/.codex/sessions`;
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
    report: false,
    doctor: false,
    reportDays: 7,
    sinceDays: 7,
    maxEvents: 200,
    allHistory: false,
    intervalMs: 8000,
    uploadIntervalMs: 10 * 60 * 1000,
    codexDbPath: DEFAULT_CODEX_DB,
    codexSessionIndexPath: DEFAULT_CODEX_SESSION_INDEX,
    codexSessionsDir: DEFAULT_CODEX_SESSIONS_DIR,
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
    } else if (arg === "--report") {
      args.report = true;
      args.once = true;
    } else if (arg === "--doctor") {
      args.doctor = true;
      args.once = true;
    } else if (arg === "--report-days") {
      args.reportDays = Number(argv[index + 1] ?? args.reportDays);
      index += 1;
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
    } else if (arg === "--upload-interval-ms") {
      args.uploadIntervalMs = Number(argv[index + 1] ?? args.uploadIntervalMs);
      index += 1;
    } else if (arg === "--codex-db") {
      args.codexDbPath = argv[index + 1] ?? args.codexDbPath;
      index += 1;
    } else if (arg === "--codex-session-index") {
      args.codexSessionIndexPath = argv[index + 1] ?? args.codexSessionIndexPath;
      index += 1;
    } else if (arg === "--codex-sessions-dir") {
      args.codexSessionsDir = argv[index + 1] ?? args.codexSessionsDir;
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

function summarizeEvents(events, ownerId, ownerName) {
  const grouped = new Map();

  for (const event of events) {
    const completedAt = String(event.completedAt ?? "").trim();
    const dateKey = completedAt.slice(0, 10);
    const agent = String(event.agent ?? "unknown").trim() || "unknown";
    if (!dateKey) {
      continue;
    }

    const summaryId = `${dateKey}:${agent}:${ownerId}`;
    const current = grouped.get(summaryId) ?? {
      summaryId,
      dateKey,
      ownerId,
      ownerName,
      agent,
      events: 0,
      sessions: 0,
      inputTokens: 0,
      cachedTokens: 0,
      cacheCreationTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
      lastCompletedAt: completedAt,
      source: "daily-agent-summary",
      sessionIds: new Set(),
    };

    current.ownerName = String(event.ownerName ?? ownerName).trim() || ownerName;
    current.events += 1;
    current.inputTokens += Number(event.inputTokens ?? 0);
    current.cachedTokens += Number(event.cachedTokens ?? 0);
    current.cacheCreationTokens += Number(event.cacheCreationTokens ?? 0);
    current.outputTokens += Number(event.outputTokens ?? 0);
    current.reasoningTokens += Number(event.reasoningTokens ?? 0);
    current.totalTokens += Number(event.totalTokens ?? 0);
    if (completedAt && completedAt > String(current.lastCompletedAt ?? "")) {
      current.lastCompletedAt = completedAt;
    }
    const sessionId = String(event.sessionId ?? "").trim();
    if (sessionId) {
      current.sessionIds.add(sessionId);
      current.sessions = current.sessionIds.size;
    }

    grouped.set(summaryId, current);
  }

  return Array.from(grouped.values()).map(({ sessionIds: _sessionIds, ...summary }) => summary);
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

function listCodexRolloutFiles(rootPath) {
  if (!existsSync(rootPath)) {
    return [];
  }

  const files = [];
  for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
    const entryPath = join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listCodexRolloutFiles(entryPath));
    } else if (entry.name.startsWith("rollout-") && entry.name.endsWith(".jsonl")) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

function parseCodexRolloutEvents(args, legacyCutoffMs) {
  const events = [];
  for (const filePath of listCodexRolloutFiles(args.codexSessionsDir)) {
    const sessionMatch = filePath.match(/([0-9a-f]{8}-[0-9a-f-]{27,})\.jsonl$/);
    if (!sessionMatch) {
      continue;
    }

    const sessionId = sessionMatch[1];
    let previous = {
      input_tokens: 0,
      cached_input_tokens: 0,
      output_tokens: 0,
      reasoning_output_tokens: 0,
      total_tokens: 0,
    };
    const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!line.trim()) {
        return;
      }
      let item;
      try {
        item = JSON.parse(line);
      } catch {
        return;
      }

      const payload = item.payload ?? {};
      if (item.type !== "event_msg" || payload.type !== "token_count") {
        return;
      }
      const cumulative = payload.info?.total_token_usage;
      if (!cumulative) {
        return;
      }

      const current = Object.fromEntries(
        Object.keys(previous).map((key) => [key, Number(cumulative[key] ?? 0)]),
      );
      const completedAt = new Date(item.timestamp ?? 0);
      const deltas = Object.fromEntries(
        Object.keys(previous).map((key) => [key, Math.max(0, current[key] - previous[key])]),
      );
      previous = current;
      if (
        Number.isNaN(completedAt.getTime()) ||
        completedAt.getTime() <= legacyCutoffMs ||
        deltas.total_tokens <= 0
      ) {
        return;
      }

      events.push({
        eventId: `codex-rollout:${sessionId}:${index}`,
        agent: "codex",
        ownerName: args.name,
        ownerId: args.ownerId,
        sessionId,
        sessionName: sessionId,
        responseId: `rollout:${sessionId}:${index}`,
        inputTokens: deltas.input_tokens,
        cachedTokens: deltas.cached_input_tokens,
        outputTokens: deltas.output_tokens,
        reasoningTokens: deltas.reasoning_output_tokens,
        totalTokens: deltas.total_tokens,
        model: "",
        completedAt: completedAt.toISOString(),
        source: "codex-rollout-jsonl",
      });
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
    const legacyEvents = parseCodexEvents(args);
    events.push(...legacyEvents);
    const legacyCutoffMs = legacyEvents.reduce(
      (latest, event) => Math.max(latest, new Date(event.completedAt).getTime()),
      0,
    );
    events.push(...parseCodexRolloutEvents(args, legacyCutoffMs));
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

function formatNumber(value) {
  return new Intl.NumberFormat("ko-KR").format(Number(value ?? 0));
}

function compareVersions(left, right) {
  const leftParts = String(left)
    .match(/\d+/g)
    ?.map(Number) ?? [];
  const rightParts = String(right)
    .match(/\d+/g)
    ?.map(Number) ?? [];
  const size = Math.max(leftParts.length, rightParts.length);
  while (leftParts.length < size) leftParts.push(0);
  while (rightParts.length < size) rightParts.push(0);
  for (let index = 0; index < size; index += 1) {
    if (leftParts[index] > rightParts[index]) return 1;
    if (leftParts[index] < rightParts[index]) return -1;
  }
  return 0;
}

async function syncOwnerName(args) {
  await requestJson(TRACKER_PROFILE_URL, {
    ownerId: args.ownerId,
    ownerName: args.name,
  });
}

async function printUsageReport(args) {
  const versionPayload = await fetch(TRACKER_VERSION_URL, {
    headers: {
      authorization: `Bearer ${TRACKER_WRITE_TOKEN}`,
    },
  }).then((response) => response.json());
  const latestVersion = versionPayload.trackerVersion ?? TRACKER_VERSION;
  const versionState = compareVersions(TRACKER_VERSION, latestVersion);
  const versionLabel = versionState < 0 ? "update available" : "up to date";
  const payload = await requestJson(TRACKER_REPORT_URL, {
    ownerId: args.ownerId,
    days: args.reportDays,
  });
  const totals = payload.totals ?? {};
  const agentTotals = payload.agentTotals ?? [];
  const daily = payload.daily ?? [];
  const trackerClient = payload.trackerClient ?? {};
  const periodLabel = payload.periodDays > 0 ? `${payload.periodDays}d` : "all";

  console.log("============================================================");
  console.log("My Usage Report");
  console.log(`owner           ${payload.ownerName ?? args.name}`);
  console.log(`ownerId         ${args.ownerId}`);
  console.log(`tracker         ${TRACKER_VERSION} (${versionLabel})`);
  if (versionState < 0) {
    console.log(`latest          ${latestVersion}`);
    console.log(`update cmd      ${recommendedUpdateCommand()}`);
  }
  console.log(`period          ${periodLabel}`);
  console.log(`active          ${formatNumber(totals.activeTokens)}`);
  console.log(`raw total       ${formatNumber(totals.totalTokens)}`);
  console.log(`input           ${formatNumber(totals.inputTokens)}`);
  console.log(`output          ${formatNumber(totals.outputTokens)}`);
  console.log(`cached          ${formatNumber(totals.cachedTokens)}`);
  console.log(`cache create    ${formatNumber(totals.cacheCreationTokens)}`);
  console.log(`sessions        ${formatNumber(totals.sessions)}`);
  console.log(`events          ${formatNumber(totals.events)}`);
  if (trackerClient.lastSeenAt) {
    console.log(`last seen       ${trackerClient.lastSeenAt}`);
  }
  console.log("============================================================");

  const rawTotal = Number(totals.totalTokens ?? 0);
  const activeTotal = Number(totals.activeTokens ?? 0);
  if (rawTotal > 0) {
    const cachedShare = ((Math.max(rawTotal - activeTotal, 0) / rawTotal) * 100).toFixed(1);
    console.log(`note            active excludes cached-read tokens (${cachedShare}% cached impact)`);
    console.log("============================================================");
  }

  if (agentTotals.length > 0) {
    console.log("By Agent");
    const totalActive = Math.max(activeTotal, 1);
    for (const item of agentTotals) {
      console.log(
        `  ${String(item.agent ?? "unknown").padEnd(8)}active=${formatNumber(item.activeTokens)} raw=${formatNumber(item.totalTokens)} share=${(((Number(item.activeTokens ?? 0) / totalActive) * 100)).toFixed(1).padStart(5)}% events=${formatNumber(item.events)}`,
      );
    }
    console.log("============================================================");
  }

  if (daily.length > 0) {
    console.log("Recent Days");
    for (const item of daily.slice(0, 12)) {
      console.log(
        `  ${String(item.dateKey ?? "-").padEnd(12)}${String(item.agent ?? "unknown").padEnd(8)}active=${formatNumber(item.activeTokens)} raw=${formatNumber(item.totalTokens)}`,
      );
    }
  } else {
    console.log("[agent-usage-tracker] No synced usage found for this owner yet.");
  }
}

function recommendedUpdateCommand() {
  if (process.platform === "win32") {
    return `powershell -NoProfile -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create((irm 'https://agent-usage-tracker.vercel.app/api/install/windows')))"`;
  }
  return `/usr/bin/curl -fsSL 'https://agent-usage-tracker.vercel.app/api/install/python' | python3`;
}

async function runDoctor(args) {
  const state = readState();
  const codexDbExists = existsSync(args.codexDbPath);
  const codexIndexExists = existsSync(args.codexSessionIndexPath);
  const claudeDirExists = existsSync(args.claudeProjectsDir);
  console.log("============================================================");
  console.log("Tracker Doctor");
  console.log(`owner           ${args.name}`);
  console.log(`ownerId         ${args.ownerId}`);
  console.log(`config          ${CONFIG_PATH}`);
  console.log(`state           ${STATE_PATH}`);
  console.log(`codex db        ${codexDbExists ? "ok" : "missing"} · ${args.codexDbPath}`);
  console.log(`codex index     ${codexIndexExists ? "ok" : "missing"} · ${args.codexSessionIndexPath}`);
  console.log(`claude dir      ${claudeDirExists ? "ok" : "missing"} · ${args.claudeProjectsDir}`);
  console.log(`upload url      ${TRACKER_UPLOAD_URL}`);
  console.log(`write token     ${TRACKER_WRITE_TOKEN ? "configured" : "missing"}`);
  console.log(`last upload     ${state.lastUploadedAt ?? "-"}`);
  try {
    const versionPayload = await fetch(TRACKER_VERSION_URL, {
      headers: {
        authorization: `Bearer ${TRACKER_WRITE_TOKEN}`,
      },
    }).then((response) => response.json());
    const latestVersion = versionPayload.trackerVersion ?? TRACKER_VERSION;
    const versionState = compareVersions(TRACKER_VERSION, latestVersion);
    console.log(
      `version         ${TRACKER_VERSION} (${versionState < 0 ? "update available" : "up to date"})`,
    );
    if (versionState < 0) {
      console.log(`update cmd      ${recommendedUpdateCommand()}`);
    }
  } catch (error) {
    console.log(`version         check failed · ${error instanceof Error ? error.message : String(error)}`);
  }
  console.log("============================================================");
  const issues = [];
  if (!TRACKER_WRITE_TOKEN) issues.push("TRACKER_WRITE_TOKEN missing");
  if (!codexDbExists && !claudeDirExists) issues.push("No Codex or Claude log source found");
  if (issues.length) {
    for (const issue of issues) {
      console.log(`[agent-usage-tracker] WARN ${issue}`);
    }
    return 1;
  }
  console.log("[agent-usage-tracker] Doctor check passed.");
  return 0;
}

async function syncOnce({ args, state }) {
  const events = collectEvents(args);
  let summaries = summarizeEvents(events, args.ownerId, args.name);
  if (args.maxEvents > 0) {
    summaries = summaries.slice(0, args.maxEvents);
  }

  if (args.dryRun) {
    const counts = summaries.reduce((acc, summary) => {
      acc[summary.agent] = (acc[summary.agent] ?? 0) + 1;
      return acc;
    }, {});
    const totalTokens = summaries.reduce((sum, summary) => sum + summary.totalTokens, 0);
    const totalEvents = summaries.reduce((sum, summary) => sum + summary.events, 0);
    console.log(
      `[agent-usage-tracker] dry-run found ${summaries.length} uploadable summary doc(s), events=${totalEvents}, totalTokens=${totalTokens}, counts=${JSON.stringify(counts)}, sinceDays=${args.allHistory ? "all" : args.sinceDays}, maxEvents=${args.maxEvents}`,
    );
    return;
  }

  const fingerprints = state.dailySummaryFingerprints ?? {};
  const changedSummaries = [];
  for (const summary of summaries) {
    const fingerprint = JSON.stringify(summary);
    if (fingerprints[summary.summaryId] === fingerprint) {
      continue;
    }
    changedSummaries.push({ summary, fingerprint });
  }

  if (changedSummaries.length === 0) {
    return;
  }

  const lastUploadedAt = Date.parse(String(state.lastUploadedAt ?? ""));
  const uploadDue =
    args.once ||
    Number.isNaN(lastUploadedAt) ||
    Date.now() - lastUploadedAt >= args.uploadIntervalMs;

  if (!uploadDue) {
    return;
  }

  for (const { summary, fingerprint } of changedSummaries) {
    fingerprints[summary.summaryId] = fingerprint;
  }

  if (changedSummaries.length > 0) {
    await requestJson(TRACKER_UPLOAD_URL, {
      ownerId: args.ownerId,
      ownerName: args.name,
      agent: args.agent,
      workspacePath: RUN_CONTEXT,
      trackerPath: ROOT,
      trackerSource: "local-agent-log-node",
      trackerVersion: TRACKER_VERSION,
      summaries: changedSummaries.map(({ summary }) => summary),
    });
  }

  state.dailySummaryFingerprints = fingerprints;
  state.lastUploadedAt = new Date().toISOString();
  state.lastSyncedAt = new Date().toISOString();
  writeState(state);

  const counts = changedSummaries.reduce((acc, { summary }) => {
    acc[summary.agent] = (acc[summary.agent] ?? 0) + 1;
    return acc;
  }, {});
  const totalTokens = changedSummaries.reduce(
    (sum, { summary }) => sum + Number(summary.totalTokens ?? 0),
    0,
  );
  console.log(
    `[agent-usage-tracker] synced ${changedSummaries.length} summary doc(s), totalTokens=${totalTokens} as ${args.name} ${JSON.stringify(counts)}`,
  );
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  const ownerProfile = await resolveOwnerProfile(args);
  args.name = ownerProfile.ownerName;
  args.ownerId = ownerProfile.ownerId;
  if (args.nameProvided) {
    await syncOwnerName(args);
  }

  if (args.report) {
    await printUsageReport(args);
    return;
  }

  if (args.doctor) {
    process.exitCode = await runDoctor(args);
    return;
  }

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
