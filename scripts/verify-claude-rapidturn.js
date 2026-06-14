// P0-1 probe: does a SECOND message sent IMMEDIATELY after turn1 completes get
// dropped? The extension's subsequent-turn path (ClaudeProcessService.startProcess
// line ~159: `if (this._pty) { this._beginTurn(); return; }`) single-injects with
// NO re-inject safety net, unlike the fresh-session `_discoverWithReinject` path.
// This probe spawns ONE session, answers the trust dialog, injects turn1, waits
// for turn1's assistant turn to land, then injects turn2 ONCE (no retry) the very
// next tick — mirroring the real subsequent-turn code — and reports whether a 2nd
// assistant turn lands within the budget WITHOUT any re-injection.
//
// Usage:  node verify-claude-rapidturn.js [exe|cmd]
const pty = require('../node_modules/node-pty');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const NATIVE = 'C:\\Users\\CQDD\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Anthropic.ClaudeCode_Microsoft.Winget.Source_8wekyb3d8bbwe\\claude.exe';
const NPM_CMD = 'C:\\Users\\CQDD\\AppData\\Roaming\\npm\\claude.cmd';
const which = process.argv[2] === 'cmd' ? 'cmd' : 'exe';
const FILE = which === 'cmd' ? NPM_CMD : NATIVE;
const PASTE_DELAY_MS = 250;

const CWD = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-rapid-'));
const args = ['--permission-mode', 'bypassPermissions', '--model', 'claude-opus-4-8'];

const t0 = Date.now();
const stamp = () => '+' + String(Date.now() - t0).padStart(6, ' ') + 'ms';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
const compact = (s) => stripAnsi(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// Pin to THIS run's transcript dir by detecting the dir that did not exist at
// startup (snapshot below). Unambiguous regardless of claude's slug rules, and
// immune to stale turns from prior runs.
const PROJ_ROOT = path.join(os.homedir(), '.claude', 'projects');
const dirsAtStart = new Set((() => { try { return fs.readdirSync(PROJ_ROOT); } catch { return []; } })());
let pinnedDir;
function assistantTurns() {
  if (!pinnedDir) {
    try {
      pinnedDir = fs.readdirSync(PROJ_ROOT)
        .filter((d) => !dirsAtStart.has(d))
        .map((d) => path.join(PROJ_ROOT, d))
        .filter((p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } })
        .map((p) => ({ p, m: fs.statSync(p).mtimeMs }))
        .sort((a, b) => b.m - a.m)[0]?.p;
    } catch { /* none yet */ }
  }
  const dir = pinnedDir;
  if (!dir) { return 0; }
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
const p = pty.spawn(FILE, args, { name: 'xterm-256color', cols: 120, rows: 40, cwd: CWD, env: process.env, useConpty: false });
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

// Single injection, exactly like _beginTurn (no retry).
function injectOnce(text) {
  p.write(`\x1b[200~${text}\x1b[201~`);
  return sleep(PASTE_DELAY_MS).then(() => p.write('\r'));
}

// Turn1 may be eaten by MCP-load readiness gap, so for turn1 we DO retry (mirrors
// the fresh-session path). The thing under test is TURN2.
async function injectUntilTurn(text, target, budgetMs) {
  const deadline = Date.now() + budgetMs;
  let nextAt = 0;
  while (Date.now() < deadline) {
    if (assistantTurns() >= target) return true;
    if (Date.now() >= nextAt) { await injectOnce(text); nextAt = Date.now() + 3500; }
    await sleep(300);
  }
  return assistantTurns() >= target;
}

(async () => {
  await sleep(2500);
  const ok1 = await injectUntilTurn('reply with exactly: RAPID1', 1, 30000);
  console.log(`${stamp()} turn1 landed=${ok1} (turns=${assistantTurns()})`);

  // *** The test ***: inject turn2 ONCE, immediately, no retry. Mirrors the real
  // subsequent-turn path. Then just WAIT (no re-inject) and see if it lands.
  console.log(`${stamp()} >>> injecting turn2 ONCE (no retry), immediately`);
  await injectOnce('reply with exactly: RAPID2');
  const target = 2;
  let landed = false;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (assistantTurns() >= target) { landed = true; break; }
    await sleep(300);
  }
  console.log(`${stamp()} turn2(single-inject) landed=${landed} (turns=${assistantTurns()})`);
  console.log(`${stamp()} === RESULT rapidSingleInjectOK=${ok1 && landed} ===`);
  console.log(`${stamp()} (if false -> subsequent-turn path NEEDS a reinject safety net)`);
  try { p.kill(); } catch {}
  setTimeout(() => { try { fs.rmSync(CWD, { recursive: true, force: true }); } catch {} process.exit(0); }, 500);
})();
