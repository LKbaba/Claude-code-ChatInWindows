// Task 3 probe: validates the subsequent-turn REINJECT WATCHDOG added to
// ClaudeProcessService._beginSubsequentTurn. The sibling verify-claude-rapidturn.js
// proves the *gap* (a single-injected turn2 can be silently dropped); this probe
// proves the *fix*: when a paste is dropped, the transcript-growth watchdog
// re-injects until the turn lands, and once it lands the prompt appears in the
// transcript EXACTLY ONCE (idempotent — an accepted prompt is never re-sent).
//
// It mirrors the watchdog logic 1:1 (baseline the transcript size, re-inject
// every 3.5s while it has not grown, stop the instant it grows, cap retries).
// To exercise the recovery path deterministically it DELIBERATELY drops the
// first turn2 paste (simulateDrop), so the watchdog must reinject to land it.
//
// Usage:  node verify-claude-rapidturn-reinject.js [exe|cmd]
const pty = require('../node_modules/node-pty');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const NATIVE = 'C:\\Users\\CQDD\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Anthropic.ClaudeCode_Microsoft.Winget.Source_8wekyb3d8bbwe\\claude.exe';
const NPM_CMD = 'C:\\Users\\CQDD\\AppData\\Roaming\\npm\\claude.cmd';
const which = process.argv[2] === 'cmd' ? 'cmd' : 'exe';
const FILE = which === 'cmd' ? NPM_CMD : NATIVE;

// Mirror the extension constants (ClaudeProcessService).
const PASTE_DELAY_MS = 250;
const REINJECT_INTERVAL_MS = 3500;
const REINJECT_MAX_RETRIES = 3;

// A unique marker so we can count exactly how many times the turn2 prompt was
// written to the transcript (idempotency check).
const TURN2_MARKER = 'RAPID2-' + Math.random().toString(36).slice(2, 10);

const CWD = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-rapid-reinj-'));
const args = ['--permission-mode', 'bypassPermissions', '--model', 'claude-opus-4-8'];

const t0 = Date.now();
const stamp = () => '+' + String(Date.now() - t0).padStart(6, ' ') + 'ms';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
const compact = (s) => stripAnsi(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// Pin to THIS run's transcript dir (the one that did not exist at startup).
const PROJ_ROOT = path.join(os.homedir(), '.claude', 'projects');
const dirsAtStart = new Set((() => { try { return fs.readdirSync(PROJ_ROOT); } catch { return []; } })());
let pinnedDir;
function resolveDir() {
  if (pinnedDir) return pinnedDir;
  try {
    pinnedDir = fs.readdirSync(PROJ_ROOT)
      .filter((d) => !dirsAtStart.has(d))
      .map((d) => path.join(PROJ_ROOT, d))
      .filter((p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } })
      .map((p) => ({ p, m: fs.statSync(p).mtimeMs }))
      .sort((a, b) => b.m - a.m)[0]?.p;
  } catch { /* none yet */ }
  return pinnedDir;
}

// Total transcript bytes across the run's jsonl files — the exact signal the
// watchdog uses (file growth => prompt accepted).
function transcriptTotalSize() {
  const dir = resolveDir();
  if (!dir) return 0;
  let total = 0;
  try {
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'))) {
      try { total += fs.statSync(path.join(dir, f)).size; } catch { /* gone */ }
    }
  } catch { /* dir vanished */ }
  return total;
}

function assistantTurns() {
  const dir = resolveDir();
  if (!dir) return 0;
  let count = 0;
  try {
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'))) {
      const txt = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const line of txt.split('\n')) {
        if (!line.trim()) continue;
        try {
          const o = JSON.parse(line);
          const sr = o?.message?.stop_reason;
          if (o.type === 'assistant' && (sr === 'end_turn' || sr === 'stop_sequence')) count++;
        } catch { /* partial line */ }
      }
    }
  } catch { /* dir vanished */ }
  return count;
}

// Wait until the transcript size stops changing for `quietMs` (or budget runs
// out). Mirrors the real extension's precondition for a subsequent turn: it only
// injects after the previous turn's end_turn, i.e. the transcript is quiescent.
async function waitQuiescent(quietMs, budgetMs) {
  const deadline = Date.now() + budgetMs;
  let last = transcriptTotalSize();
  let lastChange = Date.now();
  while (Date.now() < deadline) {
    await sleep(400);
    const now = transcriptTotalSize();
    if (now !== last) { last = now; lastChange = Date.now(); }
    else if (Date.now() - lastChange >= quietMs) return true;
  }
  return false;
}

// Count how many ACCEPTED user prompts contain the marker. Only USER prompt
// lines (type:'user' with a string message.content) count — the prompt tells
// claude to "reply with exactly: <marker>", so the marker also appears in the
// assistant reply and in tool_result user lines (array content); those must be
// excluded or a single accepted injection would over-count.
function markerOccurrences() {
  const dir = resolveDir();
  if (!dir) return 0;
  let count = 0;
  try {
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'))) {
      const txt = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const line of txt.split('\n')) {
        if (!line.trim() || line.indexOf(TURN2_MARKER) === -1) continue;
        try {
          const o = JSON.parse(line);
          const c = o?.message?.content;
          if (o.type === 'user' && typeof c === 'string' && c.includes(TURN2_MARKER)) count++;
        } catch { /* partial line */ }
      }
    }
  } catch { /* dir vanished */ }
  return count;
}

let buffer = '';
let trustHandled = false;
const p = pty.spawn(FILE, args, { name: 'xterm-256color', cols: 120, rows: 40, cwd: CWD, env: process.env, useConpty: false });
console.log(`${stamp()} spawn ${which}, cwd=${CWD}, marker=${TURN2_MARKER}`);

p.onData((d) => {
  buffer = (buffer + d).slice(-16000);
  if (!trustHandled) {
    const c = compact(buffer);
    if (c.includes('yesitrustthisfolder') && c.includes('noexit')) {
      trustHandled = true; p.write('\r'); console.log(`${stamp()} trust -> Enter`);
    } else if (c.includes('yesiaccept') && c.includes('noexit')) {
      trustHandled = true; p.write('\x1b[B'); setTimeout(() => p.write('\r'), 200); console.log(`${stamp()} bypass -> Down+Enter`);
    }
  }
});

// Single injection, exactly like ClaudeProcessService._beginTurn (paste + delay + Enter).
function injectOnce(text) {
  p.write(`\x1b[200~${text}\x1b[201~`);
  return sleep(PASTE_DELAY_MS).then(() => p.write('\r'));
}

// Turn1 uses the fresh-session retry idiom (it can be eaten by the readiness gap).
async function injectUntilTurn(text, target, budgetMs) {
  const deadline = Date.now() + budgetMs;
  let nextAt = 0;
  while (Date.now() < deadline) {
    if (assistantTurns() >= target) return true;
    if (Date.now() >= nextAt) { await injectOnce(text); nextAt = Date.now() + REINJECT_INTERVAL_MS; }
    await sleep(300);
  }
  return assistantTurns() >= target;
}

// Mirror of _beginSubsequentTurn: baseline size, inject once, then a watchdog
// that re-injects on no-growth and stops on growth. simulateDrop skips the very
// first real paste to force the recovery path. Returns the number of re-injects.
async function subsequentTurnWithWatchdog(text, opts = {}) {
  const { simulateDrop = false } = opts;
  const baseline = transcriptTotalSize();
  console.log(`${stamp()} subsequent-turn baseline=${baseline} simulateDrop=${simulateDrop}`);

  if (simulateDrop) {
    console.log(`${stamp()} >>> first paste DROPPED on purpose (no write) — watchdog must recover`);
  } else {
    await injectOnce(text);
  }

  let reinjects = 0;
  await new Promise((resolve) => {
    const tick = async () => {
      const size = transcriptTotalSize();
      if (size > baseline) {                       // grew => accepted; stop (idempotent)
        console.log(`${stamp()} watchdog: transcript grew (${baseline}->${size}); stop`);
        resolve();
        return;
      }
      if (reinjects >= REINJECT_MAX_RETRIES) {
        console.log(`${stamp()} watchdog: gave up after ${reinjects} reinjects`);
        resolve();
        return;
      }
      reinjects++;
      console.log(`${stamp()} watchdog: no growth -> reinject #${reinjects}`);
      await injectOnce(text);
      setTimeout(() => { tick().catch(() => {}); }, REINJECT_INTERVAL_MS);
    };
    setTimeout(() => { tick().catch(() => {}); }, REINJECT_INTERVAL_MS);
  });
  return reinjects;
}

(async () => {
  await sleep(2500);
  const ok1 = await injectUntilTurn('reply with exactly: RAPID1', 1, 30000);
  console.log(`${stamp()} turn1 landed=${ok1} (turns=${assistantTurns()})`);

  // Drain any late turn1 re-injection and let the transcript go quiescent BEFORE
  // baselining turn2 — this mirrors the real extension, where _beginSubsequentTurn
  // only runs after the previous turn's end_turn (transcript fully flushed). The
  // first version of this probe baselined immediately and a late RAPID1 turn
  // landing inside the watchdog window produced a false "grew => accepted".
  console.log(`${stamp()} waiting for transcript to go quiescent before turn2...`);
  await waitQuiescent(3000, 20000);
  console.log(`${stamp()} quiescent; assistantTurns=${assistantTurns()}`);

  // The test: turn2 via the watchdog, with the first paste deliberately dropped.
  const reinjects = await subsequentTurnWithWatchdog(`reply with exactly: ${TURN2_MARKER}`, { simulateDrop: true });

  // Let turn2 finish flushing, then assert landing + idempotency by the marker.
  await waitQuiescent(3000, 30000);
  const occ = markerOccurrences();
  const recovered = occ >= 1;    // turn2 landed despite the dropped first paste
  const idempotent = occ === 1;  // and the prompt was written exactly once
  console.log(`${stamp()} watchdog reinjects=${reinjects}`);
  console.log(`${stamp()} turn2 marker occurrences=${occ} (expected 1)`);
  console.log(`${stamp()} === RESULT recovered=${ok1 && recovered} idempotent=${idempotent} ===`);
  console.log(`${stamp()} (recovered: watchdog re-injected the dropped paste; idempotent: prompt written exactly once)`);
  try { p.kill(); } catch {}
  setTimeout(() => { try { fs.rmSync(CWD, { recursive: true, force: true }); } catch {} process.exit(0); }, 500);
})();
