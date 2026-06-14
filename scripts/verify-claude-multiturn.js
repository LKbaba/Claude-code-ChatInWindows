// Validates MULTI-TURN conversation over one long-lived PTY session — the core
// chat loop after the first message. Sequence:
//   spawn -> answer trust dialog -> inject turn 1 ("PING1") -> wait for transcript
//   turn -> inject turn 2 INTO THE SAME session ("PING2") -> confirm a SECOND
//   assistant turn lands in the same transcript file.
// This exercises ClaudeProcessService's subsequent-turn path (`if (this._pty)
// { this._beginTurn() }`) which skips the startup gate and re-uses the session.
//
// Usage:  node verify-claude-multiturn.js [exe|cmd]
const pty = require('../node_modules/node-pty');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const NATIVE = 'C:\\Users\\CQDD\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Anthropic.ClaudeCode_Microsoft.Winget.Source_8wekyb3d8bbwe\\claude.exe';
const NPM_CMD = 'C:\\Users\\CQDD\\AppData\\Roaming\\npm\\claude.cmd';
const which = process.argv[2] === 'cmd' ? 'cmd' : 'exe';
const FILE = which === 'cmd' ? NPM_CMD : NATIVE;
const PASTE_DELAY_MS = 250;

const CWD = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-multi-'));
const args = ['--permission-mode', 'bypassPermissions', '--model', 'claude-opus-4-8'];

const t0 = Date.now();
const stamp = () => '+' + String(Date.now() - t0).padStart(6, ' ') + 'ms';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
const compact = (s) => stripAnsi(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// Count assistant turns in the project's transcript(s): each completed turn
// writes >=1 assistant line ending in stop_reason.
function assistantTurns() {
  const root = path.join(os.homedir(), '.claude', 'projects');
  let dir;
  try {
    dir = fs.readdirSync(root).map((d) => path.join(root, d))
      .filter((p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } })
      .map((p) => ({ p, m: fs.statSync(p).mtimeMs }))
      .sort((a, b) => b.m - a.m)[0]?.p;
  } catch { return 0; }
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
const p = pty.spawn(FILE, args, { name: 'xterm-256color', cols: 120, rows: 40, cwd: CWD, env: process.env, useConpty: false });
console.log(`${stamp()} spawn ${which}, cwd=${CWD}`);

p.onData((d) => {
  buffer = (buffer + d).slice(-16000);
  if (!trustHandled) {
    const c = compact(buffer);
    if (c.includes('yesitrustthisfolder') && c.includes('noexit')) {
      trustHandled = true; p.write('\r'); console.log(`${stamp()} trust dialog -> Enter`);
    } else if (c.includes('yesiaccept') && c.includes('noexit')) {
      trustHandled = true; p.write('\x1b[B'); setTimeout(() => p.write('\r'), 200); console.log(`${stamp()} bypass dialog -> Down+Enter`);
    }
  }
});

function inject(text) {
  p.write(`\x1b[200~${text}\x1b[201~`);
  return sleep(PASTE_DELAY_MS).then(() => p.write('\r'));
}

// Re-inject every 3.5s until the transcript turn count reaches `target`.
async function injectUntilTurn(text, target, budgetMs) {
  const deadline = Date.now() + budgetMs;
  let nextAt = 0;
  while (Date.now() < deadline) {
    if (assistantTurns() >= target) return true;
    if (Date.now() >= nextAt) { await inject(text); nextAt = Date.now() + 3500; console.log(`${stamp()} injected "${text}" (want turn ${target})`); }
    await sleep(300);
  }
  return assistantTurns() >= target;
}

(async () => {
  await sleep(2500); // let trust dialog get answered + input box settle
  const ok1 = await injectUntilTurn('reply with exactly: PING1', 1, 30000);
  console.log(`${stamp()} turn1 landed=${ok1} (turns=${assistantTurns()})`);
  await sleep(1500);
  const ok2 = await injectUntilTurn('reply with exactly: PING2', 2, 30000);
  console.log(`${stamp()} turn2 landed=${ok2} (turns=${assistantTurns()})`);
  console.log(`${stamp()} === RESULT multiTurn=${ok1 && ok2} ===`);
  try { p.kill(); } catch {}
  setTimeout(() => { try { fs.rmSync(CWD, { recursive: true, force: true }); } catch {} process.exit(0); }, 500);
})();
