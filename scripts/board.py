#!/usr/bin/env python3
"""agentkit board helper: the orchestrator's bookkeeping in one command, so a run spends its tokens on stories.

usage (from the project root):
  python3 <plugin>/scripts/board.py status STR-00N FROM TO "reason"
      Moves a story (or fix story STR-00N.k) from FROM to TO in its front matter and in BOARD.md, sets
      base_commit (HEAD) the first time it goes IN_PROGRESS, bumps `updated` and appends the Run log line.
      Refuses when the story is not at FROM, so a wrong guess about the state never goes unnoticed.
  python3 <plugin>/scripts/board.py complete STR-00N K
      After review K of STR-00N passed (its report says VERDICT: PASS): marks the story and all of its fix
      stories COMPLETED (front matter and BOARD.md, Attempts = K, Last review = that report), renames each file
      to COMPLETED-<name> (moved into paths.completed when set; into <completed>/sprint-<current_sprint> when
      BOARD.md's front matter has current_sprint), flips the knowledge-log heading from IN_REVIEW to COMPLETED,
      writes the agent time report when node is available, and commits "STR-00N: mark completed" when
      workflow.git_commit_per_story is true. Stages only this story's files.

Reads paths.scrum, paths.knowledge_log, paths.completed and workflow.git_commit_per_story from agentkit.yaml.
Story files are found by their `id:` front matter line, in <scrum>/ or one folder below it (e.g. sprint-4/).
"""
import os
import re
import subprocess
import sys
from datetime import datetime

STATUSES = {"TODO", "IN_PROGRESS", "IN_VISUAL_QA", "IN_REVIEW", "COMPLETED", "BACKLOGGED", "BLOCKED"}
REPORT_DIRS = {"reviews", "visual-qa", "time", "run-logs"}  # never story files
HERE = os.path.dirname(os.path.abspath(__file__))


def die(msg):
    sys.exit(f"board: {msg}")


def git(*args, check=True):
    r = subprocess.run(["git", *args], capture_output=True, text=True)
    if check and r.returncode != 0:
        die(f"git {' '.join(args)} failed: {r.stderr.strip()}")
    return r.stdout.strip()


def config():
    """section -> key -> value for the one level of nesting agentkit.yaml uses (lists are left as text)."""
    cfg, section = {}, None
    if not os.path.exists("agentkit.yaml"):
        die("no agentkit.yaml here (run from the project root, or /agentkit:init)")
    for line in open("agentkit.yaml", encoding="utf-8"):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        m = re.match(r"^(\w+):", line)
        if m:
            section = m.group(1)
            cfg.setdefault(section, {})
            continue
        m = re.match(r"^\s+(\w+):\s*(.*?)\s*(#.*)?$", line)
        if m and section:
            cfg[section][m.group(1)] = m.group(2).strip("\"'")
    return cfg


def now():
    return datetime.now().strftime("%Y-%m-%d %H:%M")


def find_story(scrum, sid):
    """The story file whose front matter says `id: <sid>`, in <scrum>/ or one folder below it."""
    hits = []
    for dirpath, dirnames, files in os.walk(scrum):
        depth = os.path.relpath(dirpath, scrum).count(os.sep) + (dirpath != scrum)
        dirnames[:] = [d for d in dirnames if d not in REPORT_DIRS and depth < 1]
        for f in files:
            if f.endswith(".md") and f.startswith(sid) and not f.startswith("COMPLETED-"):
                p = os.path.join(dirpath, f)
                head = open(p, encoding="utf-8").read(2000)
                if re.search(rf"^id:\s*{re.escape(sid)}\s*$", head, re.M):
                    hits.append(p)
    if not hits:
        die(f"no story file with `id: {sid}` under {scrum}/")
    if len(hits) > 1:
        die(f"more than one story file for {sid}: {', '.join(hits)}")
    return hits[0]


def fix_stories(scrum, sid):
    """Fix stories STR-00N.k of a parent, found the same way."""
    out = []
    for dirpath, dirnames, files in os.walk(scrum):
        depth = os.path.relpath(dirpath, scrum).count(os.sep) + (dirpath != scrum)
        dirnames[:] = [d for d in dirnames if d not in REPORT_DIRS and depth < 1]
        for f in files:
            if f.endswith(".md") and re.match(rf"^{re.escape(sid)}\.\d+", f):
                out.append(os.path.join(dirpath, f))
    return sorted(out)


def front_value(text, key):
    m = re.search(rf"^{key}:\s*(\S+)", text.split("\n---", 1)[0], re.M)
    return m.group(1) if m else None


def set_front(text, key, value):
    head, sep, body = text.partition("\n---")
    new, n = re.subn(rf"^({key}:\s*)\S+(.*)$", rf"\g<1>{value}\g<2>", head, count=1, flags=re.M)
    if n != 1:
        die(f"front matter has no `{key}:` line")
    return new + sep + body


def board_row(board, sid):
    m = re.search(rf"^\| {re.escape(sid)} \|.*$", board, re.M)
    if not m:
        die(f"BOARD.md has no row for {sid}")
    return m


def set_cells(board, sid, changes):
    """Replace cells (0-based, after the leading |) of the story's row: {2: 'COMPLETED', 5: '1', ...}."""
    m = board_row(board, sid)
    cells = m.group(0).split("|")
    for i, v in changes.items():
        cells[i + 1] = f" {v} "
    return board[: m.start()] + "|".join(cells) + board[m.end():]


def row_status(board, sid):
    return board_row(board, sid).group(0).split("|")[3].strip()


def log(board, line):
    board = re.sub(r"^(updated:\s*).*$", rf"\g<1>{now()}", board, count=1, flags=re.M)
    return board.rstrip("\n") + f"\n{now()} {line}\n"


def status(cfg, sid, frm, to, why):
    if frm not in STATUSES or to not in STATUSES:
        die(f"statuses are {', '.join(sorted(STATUSES))}")
    scrum = cfg.get("paths", {}).get("scrum", "scrum/").rstrip("/")
    board_path = os.path.join(scrum, "BOARD.md")
    path = find_story(scrum, sid)
    text = open(path, encoding="utf-8").read()
    board = open(board_path, encoding="utf-8").read()
    if front_value(text, "status") != frm:
        die(f"{sid} front matter is {front_value(text, 'status')}, not {frm}")
    if row_status(board, sid) != frm:
        die(f"{sid} is {row_status(board, sid)} in BOARD.md, not {frm}")
    if to == "IN_PROGRESS" and front_value(text, "base_commit") in (None, "null", "~", '""'):
        head = git("rev-parse", "HEAD")
        text = set_front(text, "base_commit", head)
        why = f"{why}; base_commit {head[:7]}"
    text = set_front(text, "status", to)
    board = log(set_cells(board, sid, {2: to}), f"{sid} {frm} -> {to} ({why})")
    open(path, "w", encoding="utf-8").write(text)
    open(board_path, "w", encoding="utf-8").write(board)
    print(f"OK {sid} {frm} -> {to}; base_commit {front_value(text, 'base_commit')}")


def move(src, dest, tracked):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if tracked:
        git("mv", src, dest)
    else:
        os.rename(src, dest)


def complete(cfg, sid, k):
    paths = cfg.get("paths", {})
    scrum = paths.get("scrum", "scrum/").rstrip("/")
    board_path = os.path.join(scrum, "BOARD.md")
    report = os.path.join(scrum, "reviews", f"{sid}-review-{k}.md")
    if not os.path.exists(report):
        die(f"no review report {report}")
    if not re.search(r"^\W*verdict\W*:?\W*PASS\b", open(report, encoding="utf-8").read(), re.I | re.M):
        die(f"{report} does not say VERDICT: PASS")

    board = open(board_path, encoding="utf-8").read()
    dest_dir = os.path.dirname(find_story(scrum, sid))
    if paths.get("completed"):
        dest_dir = paths["completed"].rstrip("/")
        sprint = re.search(r"^current_sprint:\s*(\d+)", board.split("\n---", 1)[0], re.M)
        if sprint:
            dest_dir = os.path.join(dest_dir, f"sprint-{sprint.group(1)}")

    stories = [(sid, find_story(scrum, sid))]
    for p in fix_stories(scrum, sid):
        fid = front_value(open(p, encoding="utf-8").read(), "id") or os.path.basename(p).split("-")[0]
        stories.append((fid, p))
    staged = []
    for story_id, p in stories:
        text = set_front(open(p, encoding="utf-8").read(), "status", "COMPLETED")
        open(p, "w", encoding="utf-8").write(text)
        tracked = git("ls-files", "--error-unmatch", p, check=False) != ""
        if tracked:
            git("add", p)
        dest = os.path.join(dest_dir, "COMPLETED-" + os.path.basename(p))
        move(p, dest, tracked)
        staged += [dest] + ([p] if tracked else [])
        board = set_cells(board, story_id, {2: "COMPLETED"})

    link = os.path.relpath(report, scrum)
    board = set_cells(board, sid, {5: k, 6: f"[review-{k}]({link})"})
    board = log(board, f"{sid} IN_REVIEW -> COMPLETED (review-{k} PASS)")
    open(board_path, "w", encoding="utf-8").write(board)
    staged.append(board_path)

    klog = paths.get("knowledge_log", "")
    if klog and os.path.exists(klog):
        text = open(klog, encoding="utf-8").read()
        text = re.sub(rf"^(## {re.escape(sid)}(\.\d+)?: [^<\n]*?\| )IN_REVIEW( \|)", r"\1COMPLETED\3", text, flags=re.M)
        open(klog, "w", encoding="utf-8").write(text)
        staged.append(klog)

    # Where the agents' time went; a report failure never blocks completion.
    if subprocess.run(["node", "--version"], capture_output=True).returncode == 0:
        r = subprocess.run(["node", os.path.join(HERE, "time-report.mjs"), sid], capture_output=True, text=True)
        print((r.stdout or r.stderr).strip() or "time-report: done")
        for f in (f"{sid}.md", "SUMMARY.md"):
            p = os.path.join(scrum, "time", f)
            if os.path.exists(p):
                staged.append(p)

    for sub in ("reviews", "visual-qa"):
        d = os.path.join(scrum, sub)
        if os.path.isdir(d):
            staged += [os.path.join(d, f) for f in os.listdir(d) if re.match(rf"^{re.escape(sid)}[.-]", f)]

    if cfg.get("workflow", {}).get("git_commit_per_story", "true").lower() == "true":
        # Stage only this story's files: never the user's own notes or other stories.
        # Old paths of tracked files are already staged by `git mv`.
        git("add", "--", *sorted({p for p in staged if os.path.exists(p)}))
        git("commit", "-q", "-m", f"{sid}: mark completed")
        print(git("log", "--oneline", "-1"))
    print(f"OK {sid} COMPLETED ({len(stories)} story file(s) -> {dest_dir}/)")


def main():
    a = sys.argv[1:]
    if len(a) == 5 and a[0] == "status":
        status(config(), a[1], a[2], a[3], a[4])
    elif len(a) == 3 and a[0] == "complete" and a[2].isdigit():
        complete(config(), a[1], a[2])
    else:
        die(__doc__.split("\n\n", 1)[1].split("\n\nReads", 1)[0])


if __name__ == "__main__":
    os.chdir(git("rev-parse", "--show-toplevel"))
    main()
