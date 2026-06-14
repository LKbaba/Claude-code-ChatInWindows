// Task 4 probe: ESC interrupt keeps the session alive and the NEXT turn still
// lands. Mirrors ClaudeProcessService.stopProcess (writes a bare ESC to the PTY,
// does NOT kill the session). It injects a long-running prompt, waits until the
// transcript is actively growing (generation in flight), sends ESC, then checks:
//   (1) the transcript STOPS growing shortly after ESC (generation interrupted);
//   (2) the PTY process is STILL ALIVE (no exit);
//   (3) a freshly injected turn2 lands a new assistant turn (session reusable).
//
// Usage:  node verify-claude-interrupt.js [exe|cmd]
const pty = require('../node_modules/node-pty');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const NATIVE = 'C:\\Users\\CQDD\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Anthropic.ClaudeCode_Microsoft.Winget.Source_8wekyb3d8bbwe\\claude.exe';
const NPM_CMD = 'C:\\Users\\CQDD\\AppData\\Roaming\\npm\\claude.cmd';
const which = process.argv[2] === 'cmd' ? 'cmd' : 'exe';
const FILE = which === 'cmd' ? NPM_CMD : NATIVE;

const PASTE_DELAY_MS = 250;
const REINJECT_INTERVAL_MS = 3500;

const CWD = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-interrupt-'));
const args = ['--permission-mode', 'bypassPermissions', '--model', 'claude-opus-4-8'];

const t0 = Date.now();
const stamp = () => '+' + String(Date.now() - t0).padStart(6, ' ') + 'ms';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
const compact = (s) => stripAnsi(s).toLowerCase().replace(/[^a-z0-9]/g, '');

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

// Wait until the transcript size stops changing for `quietMs` (or budget runs
// out). Returns true if it went quiescent. A runaway generation never does.
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

let buffer = '';
let trustHandled = false;
let exited = false;
const p = pty.spawn(FILE, args, { name: 'xterm-256color', cols: 120, rows: 40, cwd: CWD, env: process.env, useConpty: false });
p.onExit(() => { exited = true; });
console.log(`${stamp()} spawn ${which}, cwd=${CWD}`);

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

function injectOnce(text) {
  p.write(`\x1b[200~${text}\x1b[201~`);
  return sleep(PASTE_DELAY_MS).then(() => p.write('\r'));
}

async function injectUntilGrowth(text, budgetMs) {
  const baseline = transcriptTotalSize();
  const deadline = Date.now() + budgetMs;
  let nextAt = 0;
  while (Date.now() < deadline) {
    if (transcriptTotalSize() > baseline + 80) return true; // user/assistant lines landing
    if (Date.now() >= nextAt) { await injectOnce(text); nextAt = Date.now() + REINJECT_INTERVAL_MS; }
    await sleep(250);
  }
  return transcriptTotalSize() > baseline + 80;
}

(async () => {
  await sleep(2500);

  // Turn1: a long, slow generation so we can interrupt mid-stream.
  const landed1 = await injectUntilGrowth('Count from 1 to 200, one number per line, with a short comment after each.', 30000);
  console.log(`${stamp()} turn1 generating=${landed1}`);

  // Wait until the assistant is actively streaming (transcript climbing).
  let prev = transcriptTotalSize();
  const flightDeadline = Date.now() + 15000;
  while (Date.now() < flightDeadline) {
    await sleep(500);
    const now = transcriptTotalSize();
    if (now > prev + 200) { prev = now; break; } // clearly streaming
    prev = now;
  }

  // (1) Interrupt with a bare ESC (exactly stopProcess).
  console.log(`${stamp()} >>> sending ESC interrupt`);
  const sizeAtEsc = transcriptTotalSize();
  p.write('\x1b');

  // (1) Verify generation HALTS: the transcript should go QUIESCENT within a few
  // seconds. A bounded final flush after ESC is expected (claude writes the
  // interrupted partial turn); what matters is that growth stops, not that the
  // file is byte-frozen the instant ESC lands.
  const stopped = await waitQuiescent(2500, 15000);
  const sizeAfter = transcriptTotalSize();
  console.log(`${stamp()} transcript esc=${sizeAtEsc} after=${sizeAfter} delta=${sizeAfter - sizeAtEsc} haltedToQuiescent=${stopped}`);

  // (2) Verify the PTY session is still alive.
  console.log(`${stamp()} session alive (no exit)=${!exited}`);

  // (3) Verify the next turn still lands.
  const turnsBefore = assistantTurns();
  console.log(`${stamp()} >>> injecting turn2 after interrupt (assistantTurns=${turnsBefore})`);
  await injectOnce('reply with exactly: AFTER-INTERRUPT-OK');
  let resumed = false;
  const resumeDeadline = Date.now() + 30000;
  let nextAt = Date.now() + REINJECT_INTERVAL_MS; // light retry, like the watchdog
  while (Date.now() < resumeDeadline) {
    if (assistantTurns() > turnsBefore) { resumed = true; break; }
    if (Date.now() >= nextAt) { await injectOnce('reply with exactly: AFTER-INTERRUPT-OK'); nextAt = Date.now() + REINJECT_INTERVAL_MS; }
    await sleep(300);
  }
  console.log(`${stamp()} turn2 after interrupt landed=${resumed} (assistantTurns=${assistantTurns()})`);

  console.log(`${stamp()} === RESULT stopped=${stopped} alive=${!exited} resumed=${resumed} ===`);
  console.log(`${stamp()} (all three true => ESC interrupts generation, keeps the session, and the next turn works)`);
  try { p.kill(); } catch {}
  setTimeout(() => { try { fs.rmSync(CWD, { recursive: true, force: true }); } catch {} process.exit(0); }, 500);
})();
