#!/usr/bin/env node
/**
 * Where each story's agent time went. Reads the Claude Code transcripts of the agentkit subagents (dev, visual QA,
 * reviewer, scrum master), splits every run into buckets (coding, thinking/reading, unit tests, e2e tests, build,
 * lint/typecheck, env setup, browser QA, git, other, paused) and writes:
 *   <scrum>/time/STR-NNN.md   one row per agent run of that story (fix stories included), plus its slowest commands
 *   <scrum>/time/SUMMARY.md   one row per story, and averages per agent
 * (<scrum> is paths.scrum in agentkit.yaml, default scrum/.)
 *
 * usage (from the project root): node <plugin>/scripts/time-report.mjs STR-093 [STR-094 …]   (board.py complete calls it)
 *                                node <plugin>/scripts/time-report.mjs --all          (every story with transcripts)
 * Transcripts: ~/.claude/projects/<repo path with non-alphanumerics as "-">/; override with AGENTKIT_TRANSCRIPTS.
 * Shell commands are bucketed by name (playwright/cypress = e2e; vitest, jest, pytest, go/cargo test = unit; …).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/** A model gap this long with no tool running is a pause (usage-limit sleep, waiting), not work. */
const PAUSE_MS = 10 * 60_000;
/** A step of only quick reads (tail, cat, ls, Read…) that took longer than this means the machine slept: paused. */
const QUICK_MAX_MS = 2 * 60_000;
const MINUTE_MS = 60_000;
const MINUTE_DECIMALS = 1;
/** How many of a story's slowest commands are listed. */
const SLOWEST_COMMANDS = 8;
/** Characters of a command shown in the slowest-commands table. */
const COMMAND_PREVIEW_CHARS = 110;
/** `YYYY-MM-DDTHH:MM`: the part of an ISO timestamp shown. */
const TIMESTAMP_CHARS = 16;
/** Columns before the buckets in the per-agent table: agent, runs, working, paused. */
const LEAD_COLUMNS = 4;
/** `STR-`: the prefix before a story number. */
const STORY_PREFIX_CHARS = 4;
/** A transcript needs a start and an end to have a duration. */
const MIN_ENTRIES = 2;
/** `node <script>`: the arguments that come before the user's. */
const ARGV_SKIP = 2;

const REPO = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

/** paths.scrum from agentkit.yaml (one level of nesting is all agentkit.yaml needs), default scrum/. */
function scrumDir() {
  const file = path.join(REPO, 'agentkit.yaml');
  if (!fs.existsSync(file)) return 'scrum';
  let inPaths = false;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (/^\S/.test(line)) inPaths = /^paths:/.test(line);
    const m = inPaths && line.match(/^\s+scrum:\s*["']?([^"'#\s]+)/);
    if (m) return m[1].replace(/\/$/, '');
  }
  return 'scrum';
}

const SCRUM = scrumDir();
const TRANSCRIPTS =
  process.env.AGENTKIT_TRANSCRIPTS ??
  path.join(os.homedir(), '.claude', 'projects', REPO.replace(/[^a-zA-Z0-9]/g, '-'));
const OUT_DIR = path.join(REPO, SCRUM, 'time');
const AGENT_PREFIX = 'agentkit:agent-';

const BUCKETS = [
  ['coding', 'Coding'],
  ['thinking', 'Thinking / reading'],
  ['unit', 'Unit tests'],
  ['e2e', 'E2E tests'],
  ['build', 'Build'],
  ['lint', 'Lint / typecheck'],
  ['env', 'Env setup'],
  ['browser', 'Browser QA'],
  ['git', 'Git'],
  ['other', 'Other'],
];
const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);
const READ_TOOLS = new Set(['Read', 'Grep', 'Glob']);

/** A shell command that writes source files (agents often edit with heredocs, `sed -i` or Python instead of Edit). */
const SHELL_EDIT =
  /python3? - <<|\bnode - <<|\bsed -i|\bperl -\w*i|\b(cat|tee)\b[^|;&]*>\s*\S+\.(ts|tsx|js|mjs|css|json|sql|md|yaml|yml|html)\b|<<\s*'?\w+'?\s*>\s*\S+\.(ts|tsx|js|mjs|css|json|sql|md)\b/;
/** Read-only commands that finish in seconds (after optional `cd …;` and `VAR=…;` prefixes). */
const QUICK_SHELL =
  /^(\s*(cd \S+|[A-Za-z_]+=\S+)\s*(;|&&)\s*)*\s*(tail|head|cat|ls|grep|wc|sed -n|echo|git (status|log|diff|show))\b/;
/** Polling a log or task output until a background job ends: the bucket comes from what the job printed. */
const WAIT_LOOP = /\b(until|while)\b[\s\S]*\bsleep\b/;

/** The bucket of a shell command; the first matching rule wins, so a chained `build && test` counts as tests. */
const SHELL_RULES = [
  ['e2e', /playwright|cypress|\be2e\b/],
  [
    'unit',
    /vitest|jest|pytest|\b(go|cargo|mix|dotnet) test\b|turbo run test|\b(npm|pnpm|yarn|bun)( -c \S+)?( --filter \S+)? (run )?test\b|\bmake test\b/,
  ],
  ['coding', SHELL_EDIT],
  [
    'env',
    /docker|\b(npm|pnpm|yarn|bun|pip|uv|poetry|bundle)( -c \S+)? (install|ci|sync)\b|lsof|pkill|\bkill\b|free-ports|readyz|\bcurl\b|\bsleep\b|migrate|db:seed|vite preview|\b(npm|pnpm|yarn|bun)( -c \S+)? (run )?dev\b/,
  ],
  [
    'build',
    /turbo run build|vite build|tsconfig\.build|\b(npm|pnpm|yarn|bun)( -c \S+)?( --filter \S+)? (run )?build\b|\b(cargo|go|dotnet) build\b|\bmake\b/,
  ],
  ['lint', /lint|eslint|stylelint|typecheck|\btsc\b|prettier|ruff|mypy|clippy|\bvet\b/],
  ['git', /^\s*git\b|board\.py/],
];
/** When parallel calls of one step finish together, the step's time goes to the most significant one. */
const PRIORITY = [
  'e2e',
  'unit',
  'build',
  'lint',
  'env',
  'coding',
  'browser',
  'git',
  'other',
  'thinking',
];

function shellBucket(command) {
  const c = command.toLowerCase();
  return SHELL_RULES.find(([, re]) => re.test(c))?.[0] ?? 'other';
}

function toolBucket(name, input) {
  if (name === 'Bash') return shellBucket(String(input.command ?? ''));
  if (EDIT_TOOLS.has(name)) return 'coding';
  if (READ_TOOLS.has(name)) return 'thinking';
  if (name.startsWith('mcp__plugin_chrome')) return 'browser';
  return 'other';
}

const isEditCall = (name, input) =>
  EDIT_TOOLS.has(name) ||
  (name === 'Bash' && SHELL_EDIT.test(String(input.command ?? '').toLowerCase()));

function resultText(block) {
  const c = block.content;
  if (typeof c === 'string') return c;
  return Array.isArray(c) ? c.map((part) => part.text ?? '').join('\n') : '';
}

/** A wait loop's real bucket, read from the output of the job it waited for. */
function waitBucket(text) {
  if (/Test Files|vitest/i.test(text)) return 'unit';
  if (/\d+ (passed|failed)( \(\d|\b)|playwright/i.test(text)) return 'e2e';
  return 'env';
}

function readJsonl(file) {
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .flatMap((line) => {
      try {
        const entry = JSON.parse(line);
        return entry?.timestamp ? [entry] : [];
      } catch {
        return [];
      }
    });
}

function storyOf(entries, meta) {
  const first = entries.find((e) => e.type === 'user');
  const text = first
    ? typeof first.message.content === 'string'
      ? first.message.content
      : JSON.stringify(first.message.content)
    : '';
  const id = /STR-\d+(\.\d+)?/;
  return (
    text.match(/Story:\s*\S*?(STR-\d+(\.\d+)?)/)?.[1] ??
    String(meta.description ?? '').match(id)?.[0] ??
    text.match(id)?.[0] ??
    null
  );
}

/** One agent run: wall time split into buckets, plus each shell command's duration. */
function analyseRun(entries) {
  const at = (e) => Date.parse(e.timestamp);
  const buckets = Object.fromEntries([...BUCKETS.map(([k]) => [k, 0]), ['paused', 0]]);
  const commands = [];
  // One model reply is split over several entries sharing message.id; a reply that edits files is coding time.
  const replyEdits = new Set();
  for (const e of entries) {
    if (e.type !== 'assistant' || !Array.isArray(e.message?.content)) continue;
    for (const b of e.message.content)
      if (b.type === 'tool_use' && isEditCall(b.name, b.input ?? {})) replyEdits.add(e.message.id);
  }
  const pending = new Map();
  const steps = new Map(); // reply id -> its tool calls, which run in parallel
  let lastEvent = at(entries[0]);
  let busyUntil = 0;
  for (const e of entries) {
    const t = at(e);
    if (e.type === 'assistant' && Array.isArray(e.message?.content)) {
      const gap = t - Math.max(lastEvent, busyUntil);
      if (gap > 0)
        buckets[gap > PAUSE_MS ? 'paused' : replyEdits.has(e.message.id) ? 'coding' : 'thinking'] +=
          gap;
      for (const b of e.message.content) {
        if (b.type !== 'tool_use') continue;
        const input = b.input ?? {};
        const command = b.name === 'Bash' ? String(input.command ?? '') : null;
        const quick =
          READ_TOOLS.has(b.name) ||
          (command !== null && QUICK_SHELL.test(command) && !WAIT_LOOP.test(command));
        const call = { bucket: toolBucket(b.name, input), start: t, end: t, command, quick };
        pending.set(b.id, call);
        steps.set(e.message.id, [...(steps.get(e.message.id) ?? []), call]);
      }
      lastEvent = Math.max(lastEvent, t);
    } else if (e.type === 'user' && Array.isArray(e.message?.content)) {
      for (const b of e.message.content) {
        const call = b.type === 'tool_result' ? pending.get(b.tool_use_id) : undefined;
        if (!call) continue;
        pending.delete(b.tool_use_id);
        call.end = t;
        if (
          call.command !== null &&
          WAIT_LOOP.test(call.command) &&
          ['env', 'other'].includes(call.bucket)
        )
          call.bucket = waitBucket(resultText(b));
        busyUntil = Math.max(busyUntil, t);
        lastEvent = Math.max(lastEvent, t);
      }
    }
  }
  // Each step's time goes once to its most significant call; steps never overlap each other.
  let stepFloor = 0;
  for (const calls of steps.values()) {
    const start = Math.max(Math.min(...calls.map((c) => c.start)), stepFloor);
    const end = Math.max(...calls.map((c) => c.end));
    const main = [...calls].sort(
      (a, b) =>
        PRIORITY.indexOf(a.bucket) - PRIORITY.indexOf(b.bucket) ||
        b.end - b.start - (a.end - a.start),
    )[0];
    // Only quick reads in a step that took minutes: the machine slept or stalled, so it is not work.
    const stalled = end - start > QUICK_MAX_MS && calls.every((c) => c.quick);
    const bucket = stalled ? 'paused' : main.bucket;
    if (end > start) buckets[bucket] += end - start;
    stepFloor = Math.max(stepFloor, end);
    if (main.command !== null)
      commands.push({
        command: main.command,
        bucket,
        ms: end - Math.min(...calls.map((c) => c.start)),
      });
  }
  const times = entries.map(at);
  const wall = Math.max(...times) - Math.min(...times);
  const counted = Object.values(buckets).reduce((s, v) => s + v, 0);
  buckets.other += Math.max(0, wall - counted);
  return { wall, buckets, commands };
}

function collectRuns() {
  if (!fs.existsSync(TRANSCRIPTS)) {
    process.stderr.write(`time-report: no transcripts at ${TRANSCRIPTS} (set AGENTKIT_TRANSCRIPTS)\n`);
    process.exit(1);
  }
  const runs = [];
  for (const session of fs.readdirSync(TRANSCRIPTS)) {
    const dir = path.join(TRANSCRIPTS, session, 'subagents');
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.meta.json')) continue;
      const meta = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      if (!String(meta.agentType ?? '').startsWith(AGENT_PREFIX)) continue;
      const file = path.join(dir, name.replace(/\.meta\.json$/, '.jsonl'));
      if (!fs.existsSync(file)) continue;
      const entries = readJsonl(file);
      if (entries.length < MIN_ENTRIES) continue;
      const run = storyOf(entries, meta);
      if (run === null) continue;
      runs.push({
        run,
        story: run.replace(/\.\d+$/, ''),
        agent: meta.agentType.slice(AGENT_PREFIX.length),
        model: meta.model ?? '',
        start: entries.map((e) => e.timestamp).sort()[0],
        ...analyseRun(entries),
      });
    }
  }
  return runs.sort((a, b) => a.start.localeCompare(b.start));
}

const min = (ms) => (ms / MINUTE_MS).toFixed(MINUTE_DECIMALS);
const working = (r) => r.wall - r.buckets.paused;
const sumBuckets = (rs) => {
  const s = Object.fromEntries([...BUCKETS.map(([k]) => [k, 0]), ['paused', 0]]);
  for (const r of rs) for (const k of Object.keys(s)) s[k] += r.buckets[k];
  return s;
};
const row = (cells) => `| ${cells.join(' | ')} |`;
const NOTE =
  'Minutes. **Working** excludes **Paused** (no activity for 10+ min, e.g. usage-limit sleeps). ' +
  '**Thinking / reading** is model time between steps plus reading files; **Coding** is model time composing file edits plus the edits. ' +
  'Tests, build, lint and env setup are the time those shell commands ran. Orchestrator time (the run-loop session) is not included.';

function storyReport(story, runs) {
  const head = [
    'Run',
    'Agent',
    'Model',
    'Started',
    'Working',
    'Paused',
    ...BUCKETS.map(([, label]) => label),
  ];
  const lines = [
    `# ${story}: agent time`,
    '',
    `Generated ${new Date().toISOString().slice(0, TIMESTAMP_CHARS).replace('T', ' ')} by agentkit \`scripts/time-report.mjs\`. ${NOTE}`,
    '',
    row(head),
    row(head.map(() => '---')),
  ];
  for (const r of runs) {
    lines.push(
      row([
        r.run,
        r.agent,
        r.model,
        r.start.slice(0, TIMESTAMP_CHARS).replace('T', ' '),
        min(working(r)),
        min(r.buckets.paused),
        ...BUCKETS.map(([k]) => min(r.buckets[k])),
      ]),
    );
  }
  const total = sumBuckets(runs);
  const totalWorking = runs.reduce((s, r) => s + working(r), 0);
  lines.push(
    row([
      '**Total**',
      `${runs.length} runs`,
      '',
      '',
      `**${min(totalWorking)}**`,
      min(total.paused),
      ...BUCKETS.map(([k]) => min(total[k])),
    ]),
  );
  const slow = runs
    .flatMap((r) => r.commands.map((c) => ({ ...c, run: r.run, agent: r.agent })))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, SLOWEST_COMMANDS);
  if (slow.length) {
    lines.push(
      '',
      '## Slowest commands',
      '',
      row(['Min', 'Bucket', 'Agent', 'Command']),
      row(['---', '---', '---', '---']),
    );
    for (const c of slow) {
      const cmd = c.command
        .replace(/\s+/g, ' ')
        .replace(/\|/g, '\\|')
        .slice(0, COMMAND_PREVIEW_CHARS);
      lines.push(row([min(c.ms), c.bucket, `${c.agent} (${c.run})`, `\`${cmd}\``]));
    }
  }
  return `${lines.join('\n')}\n`;
}

function summaryReport(byStory, runs) {
  const head = ['Story', 'Runs', 'Working', 'Paused', ...BUCKETS.map(([, label]) => label)];
  const lines = [
    '# Agent time per story',
    '',
    `Generated ${new Date().toISOString().slice(0, TIMESTAMP_CHARS).replace('T', ' ')}. One file per story in this folder lists each agent run and its slowest commands. ${NOTE}`,
    '',
    '## Average per agent run',
    '',
    row(['Agent', 'Runs', 'Working', 'Paused', ...BUCKETS.map(([, label]) => label)]),
    row(Array(LEAD_COLUMNS + BUCKETS.length).fill('---')),
  ];
  const agents = [...new Set(runs.map((r) => r.agent))];
  for (const agent of agents) {
    const rs = runs.filter((r) => r.agent === agent);
    const s = sumBuckets(rs);
    const avg = (v) => min(v / rs.length);
    lines.push(
      row([
        agent,
        rs.length,
        avg(rs.reduce((a, r) => a + working(r), 0)),
        avg(s.paused),
        ...BUCKETS.map(([k]) => avg(s[k])),
      ]),
    );
  }
  const stories = [...byStory.keys()].sort(
    (a, b) => Number(a.slice(STORY_PREFIX_CHARS)) - Number(b.slice(STORY_PREFIX_CHARS)),
  );
  const totals = stories.map((id) => byStory.get(id).reduce((a, r) => a + working(r), 0));
  const avgStory = totals.reduce((a, b) => a + b, 0) / Math.max(1, totals.length);
  lines.push(
    '',
    `## Per story (${stories.length} stories, average ${min(avgStory)} working min)`,
    '',
    row(head),
    row(head.map(() => '---')),
  );
  for (const id of stories) {
    const rs = byStory.get(id);
    const s = sumBuckets(rs);
    lines.push(
      row([
        `[${id}](${id}.md)`,
        rs.length,
        min(rs.reduce((a, r) => a + working(r), 0)),
        min(s.paused),
        ...BUCKETS.map(([k]) => min(s[k])),
      ]),
    );
  }
  return `${lines.join('\n')}\n`;
}

const args = process.argv.slice(ARGV_SKIP);
if (args.length === 0) {
  process.stderr.write('usage: time-report.mjs STR-NNN [STR-NNN …] | --all\n');
  process.exit(1);
}
const runs = collectRuns();
const byStory = new Map();
for (const r of runs) byStory.set(r.story, [...(byStory.get(r.story) ?? []), r]);
const wanted = args.includes('--all')
  ? [...byStory.keys()]
  : args.map((a) => a.replace(/\.\d+$/, ''));
fs.mkdirSync(OUT_DIR, { recursive: true });
for (const story of wanted) {
  const rs = byStory.get(story);
  if (!rs) {
    process.stderr.write(`time-report: no agent transcripts for ${story}\n`);
    continue;
  }
  fs.writeFileSync(path.join(OUT_DIR, `${story}.md`), storyReport(story, rs));
}
fs.writeFileSync(path.join(OUT_DIR, 'SUMMARY.md'), summaryReport(byStory, runs));
process.stdout.write(
  `time-report: ${wanted.length} story file(s) and SUMMARY.md in ${SCRUM}/time/\n`,
);
