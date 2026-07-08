#!/usr/bin/env python3
"""Minimal agent usage tracker client.

This file intentionally uses only Python's standard library so teammates do not
need Node.js, npm, pip, or Firebase SDKs on their own projects.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


THREAD_RE = re.compile(r"thread(?:\.id|_id)=([0-9a-f-]{36})")
ISO_TIMESTAMP_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$")
RUN_CONTEXT = Path.cwd()
ROOT = Path(__file__).resolve().parent
GLOBAL_CONFIG_DIR = Path.home() / ".agent-usage-tracker"
CONFIG_PATH = GLOBAL_CONFIG_DIR / "profile.json"
LEGACY_CONFIG_PATH = ROOT / ".tracker-config.json"
STATE_PATH = ROOT / ".tracker-state.json"
TRACKER_UPLOAD_URL = "__AGENT_TRACKER_UPLOAD_URL__"
TRACKER_WRITE_TOKEN = "__AGENT_TRACKER_WRITE_TOKEN__"
ANSI = {
    "reset": "\033[0m",
    "dim": "\033[2m",
    "bold": "\033[1m",
    "red": "\033[31m",
    "green": "\033[32m",
    "yellow": "\033[33m",
    "blue": "\033[34m",
    "cyan": "\033[36m",
}


def can_style() -> bool:
    return sys.stdout.isatty() or sys.stderr.isatty()


def paint(text: str, *styles: str) -> str:
    if not can_style() or not styles:
        return text
    prefix = "".join(ANSI[style] for style in styles)
    return f"{prefix}{text}{ANSI['reset']}"


def emit(message: str, level: str = "info", *, error: bool = False) -> None:
    palette = {
        "info": ("cyan", "bold"),
        "ok": ("green", "bold"),
        "warn": ("yellow", "bold"),
        "error": ("red", "bold"),
        "run": ("blue", "bold"),
    }
    label = {
        "info": "INFO",
        "ok": "OK",
        "warn": "WARN",
        "error": "ERROR",
        "run": "RUN",
    }[level]
    stream = sys.stderr if error else sys.stdout
    decorated = paint(f"[{label}]", *palette[level])
    print(f"{decorated} {message}", file=stream)


def emit_banner(args: argparse.Namespace) -> None:
    line = paint("=" * 60, "dim")
    print(line)
    print(paint("Agent Usage Tracker", "bold", "cyan"))
    print(f"{paint('workspace', 'dim'):<16}{RUN_CONTEXT}")
    print(f"{paint('tracker', 'dim'):<16}{ROOT}")
    print(f"{paint('owner', 'dim'):<16}{args.name}")
    print(f"{paint('agent', 'dim'):<16}{args.agent}")
    print(f"{paint('scan', 'dim'):<16}{args.interval_seconds}s")
    print(f"{paint('upload', 'dim'):<16}{args.upload_interval_seconds}s")
    print(f"{paint('window', 'dim'):<16}{'all history' if args.all_history else f'{args.since_days} days'}")
    print(line)


def format_counts(counts: dict[str, int]) -> str:
    if not counts:
        return "none"
    return " · ".join(f"{agent}:{count}" for agent, count in sorted(counts.items()))


def slug_fragment(value: str) -> str:
    lowered = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return lowered or "unknown"


def read_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Upload local Codex/Claude usage to Firestore.")
    parser.add_argument("--name", default="")
    parser.add_argument("--agent", choices=["all", "codex", "claude"], default="all")
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--since-days", type=float, default=7)
    parser.add_argument("--max-events", type=int, default=200)
    parser.add_argument("--all-history", action="store_true")
    parser.add_argument("--interval-seconds", type=float, default=8)
    parser.add_argument("--upload-interval-seconds", type=float, default=3600)
    parser.add_argument("--codex-db", default=str(Path.home() / ".codex" / "logs_2.sqlite"))
    parser.add_argument(
        "--codex-session-index",
        default=str(Path.home() / ".codex" / "session_index.jsonl"),
    )
    parser.add_argument("--claude-projects-dir", default=str(Path.home() / ".claude" / "projects"))
    args = parser.parse_args()
    if args.dry_run:
        args.once = True
    if args.all_history:
        args.since_days = 0
    args.name = args.name.strip()
    return args


def read_json(path: Path, fallback: dict[str, Any]) -> dict[str, Any]:
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return fallback


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    tmp_path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp_path.replace(path)


def prompt_owner_name() -> str:
    if sys.stdin.isatty():
        return input("Agent 사용자 이름: ").strip()

    tty_path = Path("/dev/tty")
    if tty_path.exists():
        with tty_path.open("w", encoding="utf-8", errors="ignore") as tty_out:
            tty_out.write("Agent 사용자 이름: ")
            tty_out.flush()
        with tty_path.open("r", encoding="utf-8", errors="ignore") as tty_in:
            return tty_in.readline().strip()

    raise RuntimeError('Owner name is required. Run again with --name "이름".')


def load_owner_profile() -> dict[str, Any]:
    config = read_json(CONFIG_PATH, {})
    if config:
        return config

    legacy = read_json(LEGACY_CONFIG_PATH, {})
    if legacy:
        if not str(legacy.get("ownerId", "")).strip():
            legacy["ownerId"] = f"owner-{uuid.uuid4().hex}"
        write_json(CONFIG_PATH, legacy)
        return legacy

    return {}


def resolve_owner_profile(args: argparse.Namespace) -> dict[str, str]:
    config = load_owner_profile()
    owner_id = str(config.get("ownerId") or f"owner-{uuid.uuid4().hex}").strip()

    if args.name:
        config["ownerName"] = args.name
        config["ownerId"] = owner_id
        config["updatedAt"] = now_iso()
        write_json(CONFIG_PATH, config)
        emit(f"saved owner name: {args.name}", "ok")
        return {"ownerName": args.name, "ownerId": owner_id}

    saved_name = str(config.get("ownerName", "")).strip()
    if saved_name:
        if str(config.get("ownerId", "")).strip() != owner_id:
            config["ownerId"] = owner_id
            write_json(CONFIG_PATH, config)
        return {"ownerName": saved_name, "ownerId": owner_id}

    env_name = os.environ.get("AGENT_TRACKER_NAME", "").strip()
    if env_name:
        config["ownerName"] = env_name
        config["ownerId"] = owner_id
        config["updatedAt"] = now_iso()
        write_json(CONFIG_PATH, config)
        return {"ownerName": env_name, "ownerId": owner_id}

    answer = prompt_owner_name()
    if not answer:
        raise RuntimeError("Owner name is required.")

    config["ownerName"] = answer
    config["ownerId"] = owner_id
    config["updatedAt"] = now_iso()
    write_json(CONFIG_PATH, config)
    emit(f"saved owner name: {answer}", "ok")
    return {"ownerName": answer, "ownerId": owner_id}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_state_time(value: Any) -> float:
    if not value:
        return 0.0
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0.0


def timestamp_iso(seconds: float) -> str:
    return datetime.fromtimestamp(seconds, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def read_codex_session_names(path: str) -> dict[str, str]:
    session_path = Path(path)
    if not session_path.exists():
        return {}
    names: dict[str, str] = {}
    for line in session_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        if item.get("id"):
            names[str(item["id"])] = str(item.get("thread_name") or "")
    return names


def query_codex_logs(path: str) -> list[sqlite3.Row]:
    db_path = Path(path)
    if not db_path.exists():
        return []
    sql = """
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
    """
    connection = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    try:
        return list(connection.execute(sql))
    finally:
        connection.close()


def nearest_thread_id(recent_threads: list[dict[str, Any]], event_ts: float) -> str:
    for item in reversed(recent_threads):
        if event_ts - float(item["ts"]) > 30:
            break
        return str(item["threadId"])
    return ""


def parse_codex_events(args: argparse.Namespace) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    recent_threads: list[dict[str, Any]] = []
    session_names = read_codex_session_names(args.codex_session_index)

    for row in query_codex_logs(args.codex_db):
        body = row["feedback_log_body"] or ""
        match = THREAD_RE.search(body)
        if match:
            recent_threads.append({"ts": float(row["ts"]), "threadId": match.group(1)})
            recent_threads = recent_threads[-200:]

        if (
            row["target"] != "log"
            or not body.startswith("Received message ")
            or '"type":"response.completed"' not in body
            or '"usage":{' not in body
        ):
            continue

        try:
            payload = json.loads(body[len("Received message ") :])
        except json.JSONDecodeError:
            continue

        response = payload.get("response") or {}
        usage = response.get("usage") or {}
        if not usage.get("total_tokens") or not response.get("id"):
            continue

        session_id = nearest_thread_id(recent_threads, float(row["ts"]))
        completed_seconds = float(response.get("completed_at") or row["ts"])
        events.append(
            {
                "eventId": f"codex:{response['id']}",
                "agent": "codex",
                "ownerName": args.name,
                "ownerId": args.owner_id,
                "sessionId": session_id,
                "sessionName": session_names.get(session_id, ""),
                "responseId": str(response["id"]),
                "inputTokens": int(usage.get("input_tokens") or 0),
                "cachedTokens": int((usage.get("input_tokens_details") or {}).get("cached_tokens") or 0),
                "outputTokens": int(usage.get("output_tokens") or 0),
                "reasoningTokens": int((usage.get("output_tokens_details") or {}).get("reasoning_tokens") or 0),
                "totalTokens": int(usage.get("total_tokens") or 0),
                "model": str(response.get("model") or ""),
                "completedAt": timestamp_iso(completed_seconds),
                "source": "codex-local-log",
            }
        )
    return events


def parse_claude_timestamp(value: Any) -> str:
    if isinstance(value, str) and value:
        try:
            normalized = value.replace("Z", "+00:00")
            return datetime.fromisoformat(normalized).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        except ValueError:
            pass
    return now_iso()


def parse_claude_events(args: argparse.Namespace) -> list[dict[str, Any]]:
    projects_dir = Path(args.claude_projects_dir)
    if not projects_dir.exists():
        return []
    events: list[dict[str, Any]] = []
    for jsonl_path in projects_dir.glob("*/*.jsonl"):
        for line in jsonl_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                item = json.loads(line)
            except json.JSONDecodeError:
                continue
            message = item.get("message") or {}
            usage = message.get("usage")
            if item.get("type") != "assistant" or not usage or not message.get("id"):
                continue
            input_tokens = int(usage.get("input_tokens") or 0)
            cache_creation_tokens = int(usage.get("cache_creation_input_tokens") or 0)
            cache_read_tokens = int(usage.get("cache_read_input_tokens") or 0)
            output_tokens = int(usage.get("output_tokens") or 0)
            total_tokens = input_tokens + cache_creation_tokens + cache_read_tokens + output_tokens
            if not total_tokens:
                continue
            session_id = str(item.get("sessionId") or jsonl_path.stem)
            events.append(
                {
                    "eventId": f"claude:{session_id}:{message['id']}",
                    "agent": "claude",
                    "ownerName": args.name,
                    "ownerId": args.owner_id,
                    "sessionId": session_id,
                    "sessionName": str(item.get("cwd") or ""),
                    "responseId": str(message["id"]),
                    "inputTokens": input_tokens,
                    "cachedTokens": cache_read_tokens,
                    "cacheCreationTokens": cache_creation_tokens,
                    "outputTokens": output_tokens,
                    "reasoningTokens": 0,
                    "totalTokens": total_tokens,
                    "model": str(message.get("model") or ""),
                    "completedAt": parse_claude_timestamp(item.get("timestamp")),
                    "source": "claude-code-jsonl",
                }
            )
    return events


def parse_iso_to_seconds(value: str) -> float:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()


def collect_events(args: argparse.Namespace) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    if args.agent in ("all", "codex"):
        events.extend(parse_codex_events(args))
    if args.agent in ("all", "claude"):
        events.extend(parse_claude_events(args))
    cutoff = 0 if args.all_history else time.time() - args.since_days * 24 * 60 * 60
    return sorted(
        [event for event in events if parse_iso_to_seconds(event["completedAt"]) >= cutoff],
        key=lambda event: parse_iso_to_seconds(event["completedAt"]),
        reverse=True,
    )


def summarize_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}

    for event in events:
        date_key = str(event["completedAt"])[:10]
        owner_name = str(event.get("ownerName") or "unassigned")
        owner_id = str(event.get("ownerId") or slug_fragment(owner_name))
        agent = str(event.get("agent") or "unknown")
        summary_id = f"{date_key}:{agent}:{owner_id}"

        item = grouped.get(summary_id)
        if item is None:
            item = {
                "summaryId": summary_id,
                "dateKey": date_key,
                "ownerName": owner_name,
                "ownerId": owner_id,
                "agent": agent,
                "events": 0,
                "sessions": set(),
                "inputTokens": 0,
                "cachedTokens": 0,
                "cacheCreationTokens": 0,
                "outputTokens": 0,
                "reasoningTokens": 0,
                "totalTokens": 0,
                "lastCompletedAt": event["completedAt"],
                "source": "daily-agent-summary",
            }
            grouped[summary_id] = item

        item["events"] += 1
        if event.get("sessionId"):
            item["sessions"].add(str(event["sessionId"]))
        item["inputTokens"] += int(event.get("inputTokens") or 0)
        item["cachedTokens"] += int(event.get("cachedTokens") or 0)
        item["cacheCreationTokens"] += int(event.get("cacheCreationTokens") or 0)
        item["outputTokens"] += int(event.get("outputTokens") or 0)
        item["reasoningTokens"] += int(event.get("reasoningTokens") or 0)
        item["totalTokens"] += int(event.get("totalTokens") or 0)

        if str(event["completedAt"]) > str(item["lastCompletedAt"]):
            item["lastCompletedAt"] = event["completedAt"]

    summaries: list[dict[str, Any]] = []
    for item in grouped.values():
        summaries.append(
            {
                "summaryId": item["summaryId"],
                "dateKey": item["dateKey"],
                "ownerName": item["ownerName"],
                "ownerId": item["ownerId"],
                "agent": item["agent"],
                "events": item["events"],
                "sessions": len(item["sessions"]),
                "inputTokens": item["inputTokens"],
                "cachedTokens": item["cachedTokens"],
                "cacheCreationTokens": item["cacheCreationTokens"],
                "outputTokens": item["outputTokens"],
                "reasoningTokens": item["reasoningTokens"],
                "totalTokens": item["totalTokens"],
                "lastCompletedAt": item["lastCompletedAt"],
                "source": item["source"],
            }
        )

    return sorted(summaries, key=lambda item: item["lastCompletedAt"], reverse=True)


def request_json(url: str, method: str, body: dict[str, Any], token: str = "") -> dict[str, Any]:
    data = json.dumps(body).encode("utf-8")
    headers = {"content-type": "application/json"}
    if token:
        headers["authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {error.code}: {detail}") from error
    except urllib.error.URLError as error:
        return request_json_with_curl(url, method, data, headers, error)


def request_json_with_curl(
    url: str,
    method: str,
    data: bytes,
    headers: dict[str, str],
    original_error: Exception,
) -> dict[str, Any]:
    command = ["curl", "-sSL", "-X", method]
    for key, value in headers.items():
        command.extend(["-H", f"{key}: {value}"])
    command.extend(["--data-binary", "@-", url])

    try:
        result = subprocess.run(
            command,
            input=data,
            capture_output=True,
        )
        if result.returncode != 0:
            detail = error_text(result.stderr) or error_text(result.stdout)
            raise RuntimeError(f"curl HTTP request failed: {detail}")

        payload_text = result.stdout.decode("utf-8", errors="replace")
        payload = json.loads(payload_text)
        if isinstance(payload, dict) and "error" in payload:
            raise RuntimeError(describe_api_error(payload["error"]))
        return payload
    except FileNotFoundError as error:
        raise RuntimeError(f"{original_error}. curl fallback is not available.") from error
    except json.JSONDecodeError as error:
        raise RuntimeError(f"curl returned non-JSON response for {url}") from error


def error_text(value: bytes) -> str:
    return value.decode("utf-8", errors="replace").strip()


def describe_api_error(error: Any) -> str:
    if isinstance(error, dict):
        code = error.get("code")
        status = error.get("status")
        message = error.get("message")
        parts = [str(part) for part in [code, status, message] if part]
        if parts:
            return "API error: " + " | ".join(parts)
        return f"API error: {json.dumps(error, ensure_ascii=False)}"
    return f"API error: {error}"


def sync_once(args: argparse.Namespace, state: dict[str, Any]) -> None:
    events = collect_events(args)
    summaries = summarize_events(events)
    if args.max_events > 0:
        summaries = summaries[: args.max_events]

    if args.dry_run:
        counts: dict[str, int] = {}
        total_tokens = 0
        total_event_count = 0
        for summary in summaries:
            counts[summary["agent"]] = counts.get(summary["agent"], 0) + 1
            total_tokens += int(summary["totalTokens"])
            total_event_count += int(summary["events"])
        emit(
            "dry-run "
            f"summaries={len(summaries)} events={total_event_count} total_tokens={total_tokens} agents={format_counts(counts)}",
            "info",
        )
        return

    fingerprints = state.get("dailySummaryFingerprints") or {}
    changed_summaries = []
    for summary in summaries:
        fingerprint = json.dumps(summary, ensure_ascii=False, sort_keys=True)
        if fingerprints.get(summary["summaryId"]) == fingerprint:
            continue
        changed_summaries.append((summary, fingerprint))

    if not changed_summaries:
        return

    last_uploaded_at = parse_state_time(state.get("lastUploadedAt"))
    upload_due = args.once or not last_uploaded_at
    if not upload_due:
        upload_due = (time.time() - last_uploaded_at) >= args.upload_interval_seconds

    if not upload_due:
        return

    changed = 0
    changed_counts: dict[str, int] = {}
    changed_tokens = 0

    payload = {
        "ownerId": args.owner_id,
        "ownerName": args.name,
        "agent": args.agent,
        "workspacePath": str(RUN_CONTEXT),
        "trackerPath": str(ROOT),
        "trackerSource": "local-agent-log-python",
        "summaries": [],
    }

    for summary, fingerprint in changed_summaries:
        fingerprints[summary["summaryId"]] = fingerprint
        payload["summaries"].append(summary)
        changed += 1
        changed_counts[summary["agent"]] = changed_counts.get(summary["agent"], 0) + 1
        changed_tokens += int(summary["totalTokens"])

    request_json(
        TRACKER_UPLOAD_URL,
        "POST",
        payload,
        token=TRACKER_WRITE_TOKEN,
    )

    state["dailySummaryFingerprints"] = fingerprints
    state["lastUploadedAt"] = now_iso()
    state["lastSyncedAt"] = now_iso()
    write_json(STATE_PATH, state)

    if changed:
        emit(
            f"synced {changed} summary doc(s) · tokens={changed_tokens} · agents={format_counts(changed_counts)}",
            "ok",
        )


def explain_error(error: Exception) -> str:
    return str(error)


def main() -> int:
    args = read_args()
    owner_profile = resolve_owner_profile(args)
    args.name = owner_profile["ownerName"]
    args.owner_id = owner_profile["ownerId"]
    emit_banner(args)
    state = read_json(STATE_PATH, {"uploadedEventIds": []})

    if args.dry_run:
        sync_once(args, state)
        return 0

    if args.once:
        sync_once(args, state)
        return 0

    emit("watching local agent logs", "run")
    while True:
        try:
            sync_once(args, state)
        except Exception as error:  # Keep the watcher alive during transient failures.
            emit(explain_error(error), "error", error=True)
        time.sleep(args.interval_seconds)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        emit("stopped", "warn")
        raise SystemExit(0)
    except Exception as error:
        emit(explain_error(error), "error", error=True)
        raise SystemExit(1)
