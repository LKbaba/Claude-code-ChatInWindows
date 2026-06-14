// Validates the two pending fixes against REAL claude in one run:
//  (1) Workspace-trust startup dialog ("Do you trust the files ... / Yes, I
//      trust this folder / No, exit", default=Yes) -> event-driven detection,
//      confirm with a single Enter (\r), NOT Down+Enter.
//  (2) Paste-submit race -> after bracketed-paste injection, wait a short delay
//      before \r so the TUI does not eat the Enter while still "Pasting".
// It runs in a FRESH temp cwd (never trusted) to force the trust dialog, then
// watches ~/.claude/projects/<slug>/*.jsonl for a new transcript = turn started.
//
// Usage:  node verify-claude-trust-paste.js [exe|cmd] [pasteDelayMs]
//   exe -> native claude.exe (WinGet)   cmd -> npm claude.cmd
const pty = require('../node_modules/node-pty');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const NATIVE = 'C:\\Users\\CQDD\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Anthropic.ClaudeCode_Microsoft.Winget.Source_8wekyb3d8bbwe\\claude.exe';
const NPM_CMD = 'C:\\Users\\CQDD\\AppData\\Roaming\\npm\\claude.cmd';

const which = process.argv[2] === 'cmd' ? 'cmd' : 'exe';
const FILE = which === 'cmd' ? NPM_CMD : NATIVE;
const PASTE_DELAY_MS = parseInt(process.argv[3] || '250', 10);

// Fresh, never-trusted working dir to guarantee the workspace-trust dialog.
const CWD = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-trust-'));
const args = ['--permission-mode', 'bypassPermissions', '--model', 'claude-opus-4-8'];

const t0 = Date.now();
const stamp = () => '+' + String(Date.now() - t0).padStart(6, ' ') + 'ms';
const esc = (s) => s.replace(/[\x00-\x1f\x7f]/g, (c) => (c === '\x1b' ? '\\e' : c === '\n' ? '\\n' : c === '\r' ? '\\r' : '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
const compact = (s) => stripAnsi(s).toLowerCase().replace(/[^a-z0-9]/g, '');

function transcriptCount() {
  const slug = '-' + CWD.replace(/\\/g, '/').replace(/\//g, '-').replace(/^-/, '');
  const dir = path.join(os.homedir(), '.claude', 'projects', slug);
  try { return fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).length; } catch { return 0; }
}

console.log(`${stamp()} cwd=${CWD}`);
console.log(`${stamp()} spawn ${which} (pasteDelay=${PASTE_DELAY_MS}ms)...`);
const p = pty.spawn(FILE, args, { name: 'xterm-256color', cols: 120, rows: 40, cwd: CWD, env: process.env, useConpty: false });

let buffer = '';
let trustHandled = false;
let lastDataAt = Date.now();
let sawResponse = false;
let phase = 'startup';

p.onData((d) => {
  lastDataAt = Date.now();
  buffer = (buffer + d).slice(-16000);
  const plain = stripAnsi(d);
  if (phase === 'afterPrompt' && /esc to interrupt|Thinking|PONG|pong|tokens|✻|·/i.test(plain)) sawResponse = true;
  console.log(`${stamp()} [${phase}] <<${d.length}b>> ${esc(d).slice(0, 140)}`);

  // (1) Event-driven workspace-trust detection: fire ONCE, confirm with Enter.
  if (!trustHandled) {
    const c = compact(buffer);
    const isTrust = c.includes('yesitrustthisfolder') && c.includes('noexit');
    const isBypass = c.includes('yesiaccept') && c.includes('noexit');
    if (isTrust || isBypass) {
      trustHandled = true;
      const kind = isTrust ? 'TRUST(default=Yes)' : 'BYPASS(default=No)';
      console.log(`${stamp()} === dialog detected: ${kind} ===`);
      // Trust default is Yes -> bare Enter. Bypass default is No -> Down then Enter.
      if (isBypass) { p.write('\x1b[B'); setTimeout(() => p.write('\r'), 200); }
      else { p.write('\r'); }
    }
  }
});

async function waitQuiet(minQuiet, hardCap) {
  const start = Date.now();
  while (true) {
    await sleep(100);
    if (Date.now() - lastDataAt > minQuiet && Date.now() - start > 600) return;
    if (Date.now() - start > hardCap) return;
  }
}

(async () => {
  // Let the trust dialog appear + get auto-confirmed, then settle to input box.
  await waitQuiet(1500, 9000);
  const before = transcriptCount();
  console.log(`${stamp()} === inject prompt (transcripts before=${before}) ===`);
  phase = 'afterPrompt';
  // (2) Bracketed paste + delay + Enter.
  p.write('\x1b[200~reply with exactly: PONG\x1b[201~');
  await sleep(PASTE_DELAY_MS);
  p.write('\r');

  // Watch for a new transcript file (turn actually started) + a visible response.
  let sawTranscript = false;
  for (let i = 0; i < 120; i++) {
    await sleep(100);
    if (transcriptCount() > before) { sawTranscript = true; break; }
  }
  console.log(`${stamp()} transcript appeared=${sawTranscript}`);
  await sleep(6000);
  console.log(`${stamp()} === RESULT trustHandled=${trustHandled} transcript=${sawTranscript} sawResponse=${sawResponse} ===`);
  try { p.kill(); } catch {}
  setTimeout(() => { try { fs.rmSync(CWD, { recursive: true, force: true }); } catch {} process.exit(0); }, 400);
})();
