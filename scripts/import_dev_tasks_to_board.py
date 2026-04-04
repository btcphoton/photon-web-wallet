#!/usr/bin/env python3
"""
Import /home/waheed/screenshots/dev-tasks.csv into PhotonBolt Sprint Board.

Board API:
  - GET  https://faucet.photonbolt.xyz/api/board/tickets
  - POST https://faucet.photonbolt.xyz/api/board/tickets
Auth:
  - Header: x-photon-board-token: photon-board-auth-v1

Notes:
  - Uses CSV Task ID as the board ticket id (INF-01, PROJ-01, ...).
  - Migration mode: if a previous import created PHO-### tickets with markers like "[INF-01]",
    this script can create the canonical INF-01 ticket and merge the old PHO ticket into it
    (so it disappears from the board).
"""

from __future__ import annotations

import csv
import json
import sys
import urllib.request
from typing import Any, Dict, List, Set


CSV_PATH = "/home/waheed/screenshots/dev-tasks.csv"
BOARD_API_BASE = "https://faucet.photonbolt.xyz/api/board"
BOARD_TOKEN = "photon-board-auth-v1"
MIGRATE_OLD_PHOS = True


def http_json(url: str, method: str = "GET", body: Any | None = None) -> Any:
    data = None
    headers = {
        "Accept": "application/json",
        "x-photon-board-token": BOARD_TOKEN,
    }
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw)
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8") if hasattr(e, "read") else ""
        try:
            return json.loads(raw) if raw else {"ok": False, "error": f"HTTP {e.code}"}
        except Exception:
            return {"ok": False, "error": f"HTTP {e.code}: {raw}".strip()}


def map_priority(value: str) -> str:
    v = (value or "").strip().upper()
    if v == "MUST":
        return "high"
    if v == "SHOULD":
        return "medium"
    if v == "NICE":
        return "low"
    return "medium"


def map_category(phase_name: str) -> str:
    p = (phase_name or "").strip().lower()
    if "infrastructure" in p or "devops" in p:
        return "infra"
    if "android" in p:
        return "android"
    if "chrome extension" in p or "extension" in p or "ui" in p or "dashboard" in p:
        return "ui"
    if "security" in p:
        return "backend"
    if "authentication" in p or "account" in p:
        return "backend"
    if "wallet" in p or "payments" in p or "node" in p:
        return "node"
    if "rgb" in p or "asset" in p:
        return "token"
    return "backend"


def safe(value: str) -> str:
    return (value or "").strip()


def build_description(row: Dict[str, str]) -> str:
    parts: List[str] = []
    parts.append(f"CSV Task ID: {safe(row.get('Task ID'))}")
    parts.append(f"Phase: {safe(row.get('Phase Number'))} - {safe(row.get('Phase Name'))}")
    if safe(row.get("Week / Timeline")):
        parts.append(f"Timeline: {safe(row.get('Week / Timeline'))}")
    if safe(row.get("Priority")):
        parts.append(f"Priority: {safe(row.get('Priority'))}")
    if safe(row.get("Phase Description")):
        parts.append("")
        parts.append(safe(row.get("Phase Description")))
    if safe(row.get("Description")):
        parts.append("")
        parts.append(safe(row.get("Description")))
    return "\n".join(parts).strip()


def main() -> int:
    payload = http_json(f"{BOARD_API_BASE}/tickets", "GET")
    if not payload.get("ok"):
        print(f"Failed to load board tickets: {payload}", file=sys.stderr)
        return 2

    existing_tickets = [t for t in (payload.get("tickets") or []) if isinstance(t, dict)]
    existing_ids: Set[str] = set(str(t.get("id") or "").strip().upper() for t in existing_tickets)
    marker_to_sources: Dict[str, List[str]] = {}
    for ticket in existing_tickets:
        title_str = str(ticket.get("title") or "")
        if title_str.startswith("[") and "]" in title_str:
            marker = title_str.split("]")[0] + "]"
            marker_to_sources.setdefault(marker, []).append(str(ticket.get("id") or "").strip().upper())

    created = 0
    skipped = 0
    merged = 0

    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            task_id = safe(row.get("Task ID"))
            if not task_id:
                continue

            marker = f"[{task_id}]"
            canonical_id = task_id.strip().upper()

            if canonical_id in existing_ids:
                skipped += 1
                if MIGRATE_OLD_PHOS and marker in marker_to_sources:
                    for source_id in marker_to_sources.get(marker, []):
                        if not source_id or source_id == canonical_id:
                            continue
                        merge_body = {
                            "sourceTicketId": source_id,
                            "targetTicketId": canonical_id,
                            "note": f"Migrated: canonical id is {canonical_id}",
                        }
                        merge_result = http_json(f"{BOARD_API_BASE}/merge", "POST", merge_body)
                        if merge_result.get("ok"):
                            merged += 1
                        else:
                            print(f"Merge failed {source_id} -> {canonical_id}: {merge_result}", file=sys.stderr)
                continue

            title = safe(row.get("Task Name")) or task_id
            ticket = {
                "ticketId": canonical_id,
                "title": f"{marker} {title}".strip(),
                "status": "todo",
                "category": map_category(row.get("Phase Name") or ""),
                "priority": map_priority(row.get("Priority") or ""),
                "estimate": "1d",
                "assignee": "—",
                "description": build_description(row),
                "links": [],
            }

            result = http_json(f"{BOARD_API_BASE}/tickets", "POST", ticket)
            if not result.get("ok"):
                print(f"Failed creating {task_id}: {result}", file=sys.stderr)
                return 3

            created += 1
            existing_ids.add(canonical_id)

            if MIGRATE_OLD_PHOS and marker in marker_to_sources:
                for source_id in marker_to_sources.get(marker, []):
                    if not source_id or source_id == canonical_id:
                        continue
                    merge_body = {
                        "sourceTicketId": source_id,
                        "targetTicketId": canonical_id,
                        "note": f"Migrated: canonical id is {canonical_id}",
                    }
                    merge_result = http_json(f"{BOARD_API_BASE}/merge", "POST", merge_body)
                    if merge_result.get("ok"):
                        merged += 1
                    else:
                        print(f"Merge failed {source_id} -> {canonical_id}: {merge_result}", file=sys.stderr)

    print(f"Import complete. Created={created} Skipped={skipped} Merged={merged}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
MIGRATE_OLD_PHOS = True
