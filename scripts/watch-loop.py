#!/usr/bin/env python3
"""Live feed of an agentkit run loop (scripts/run-loop.sh).

Follows every headless loop session for the current project, plus each one's dev / visual QA / reviewer
subagents, and switches to each new story's session automatically. Only reads Claude Code's transcript files.

usage (from the project root):  python3 <plugin>/scripts/watch-loop.py [--from-start]
  --from-start   replay the newest loop session from its first line (default: last 15 events, then follow)
"""
import glob
import json
import os
import re
import sys
import time
from datetime import datetime

MARKERS = ("/agentkit:run next unattended", "unattended headless run")  # run-loop.sh prompt (and older custom loops)
POLL_SECONDS = 1.0
TAIL_EVENTS = 15
TEXT_MAX = 400
TOOL_MAX = 140

C = {"main": "\033[1;36m", "dev": "\033[1;32m", "visual-qa": "\033[1;35m", "reviewer": "\033[1;33m",
     "other": "\033[1;34m", "dim": "\033[2m", "off": "\033[0m"}

project_dir = os.path.expanduser("~/.claude/projects/" + re.sub(r"[^A-Za-z0-9]", "-", os.getcwd()))
if not os.path.isdir(project_dir):
    sys.exit(f"watch-loop: no transcripts at {project_dir} (run this from the project root)")

loop_sessions = {}   # session file -> True (loop) / False (not a loop session)
offsets = {}         # followed file -> bytes already read
labels = {}          # followed file -> (colour key, label)


def is_loop_session(path):
    try:
        with open(path, errors="replace") as f:
            head = f.read(20000)
    except OSError:
        return False
    return any(m in head for m in MARKERS)


def subagent_label(path):
    meta = path[: -len(".jsonl")] + ".meta.json"
    try:
        with open(meta) as f:
            m = json.load(f)
    except (OSError, ValueError):
        return "other", "subagent"
    kind = m.get("agentType", "").split(":")[-1].replace("agent-", "") or "subagent"
    key = kind if kind in C else "other"
    return key, f"{kind} ({m.get('model', '?')}): {m.get('description', '')}"[:70]


def events(line):
    try:
        rec = json.loads(line)
    except ValueError:
        return
    if rec.get("type") != "assistant":
        return
    stamp = local_time(rec.get("timestamp"))
    for part in rec.get("message", {}).get("content", []) or []:
        if part.get("type") == "text" and part.get("text", "").strip():
            yield stamp, "text", " ".join(part["text"].split())[:TEXT_MAX]
        elif part.get("type") == "tool_use":
            inp = part.get("input", {}) or {}
            what = inp.get("description") or inp.get("command") or inp.get("file_path") or inp.get("pattern") or ""
            yield stamp, "tool", f"{part.get('name')}  {' '.join(str(what).split())}"[:TOOL_MAX]


def local_time(iso):
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone().strftime("%H:%M:%S")
    except (AttributeError, ValueError):
        return time.strftime("%H:%M:%S")


def show(path, line):
    key, label = labels[path]
    for stamp, kind, body in events(line):
        icon = "💬" if kind == "text" else "🔧"
        print(f"{C['dim']}{stamp}{C['off']} {C[key]}[{label}]{C['off']} {icon} {body}", flush=True)


def follow(path, label, replay):
    labels[path] = label
    if replay == "all":
        offsets[path] = 0
        return
    size = os.path.getsize(path)
    offsets[path] = size
    if replay == "tail":
        with open(path, errors="replace") as f:
            lines = f.readlines()
        shown = [l for l in lines if any(True for _ in events(l))][-TAIL_EVENTS:]
        for l in shown:
            show(path, l)


def scan(first):
    sessions = sorted(glob.glob(os.path.join(project_dir, "*.jsonl")), key=os.path.getmtime)
    for s in sessions:
        if s not in loop_sessions:
            loop_sessions[s] = is_loop_session(s)
    loops = [s for s in sessions if loop_sessions[s]]
    newest = loops[-1] if loops else None
    for s in loops:
        if s in offsets:
            continue
        if first and s != newest:
            loop_sessions[s] = False   # older loop sessions: not followed
            continue
        sid = os.path.basename(s)[:8]
        print(f"\n{C['main']}══ loop session {sid} ══{C['off']}", flush=True)
        replay = ("all" if "--from-start" in sys.argv else "tail") if first else "all"
        follow(s, ("main", f"orchestrator {sid}"), replay)
    for s in loops:
        if s not in offsets:
            continue
        for sub in sorted(glob.glob(os.path.join(s[: -len(".jsonl")], "subagents", "*.jsonl")), key=os.path.getmtime):
            if sub not in offsets:
                follow(sub, subagent_label(sub), "tail" if first else "all")


def pump():
    for path, off in list(offsets.items()):
        try:
            size = os.path.getsize(path)
        except OSError:
            continue
        if size <= off:
            continue
        with open(path, errors="replace") as f:
            f.seek(off)
            chunk = f.read()
        complete, _, rest = chunk.rpartition("\n")
        if not _:
            continue           # no complete line yet
        offsets[path] = off + len(complete.encode()) + 1
        for line in complete.split("\n"):
            show(path, line)


print(f"watch-loop: following loop sessions in {project_dir} (Ctrl-C to stop)", flush=True)
first = True
try:
    while True:
        scan(first)
        if first and not offsets:
            print("watch-loop: no loop session yet; waiting for run-loop.sh to start one…", flush=True)
        first = False
        pump()
        time.sleep(POLL_SECONDS)
except KeyboardInterrupt:
    print()
