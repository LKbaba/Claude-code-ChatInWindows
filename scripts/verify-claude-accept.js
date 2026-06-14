// Validates the real fix: the bypassPermissions startup dialog ("WARNING:
// Bypass Permissions mode / 1. No, exit / 2. Yes, I accept") defaults to
// "No, exit". We must accept it (option 2) BEFORE the prompt input box is live.
// Sequence per run: wait for settle -> send accept keys -> wait -> send a real
// prompt + Enter -> watch for a model response.
//   accept method via arg 3:  "down" (Down+Enter) | "num" (type 2 +Enter) | "2only"
// Usage:  node verify-claude-accept.js [winpty|conpty] [down|num|2only]
const pty = require('../node_modules/node-pty');

const NPM = 'C:\\Users\\CQDD\\AppData\\Roaming\\npm';
const FILE = NPM + '\\claude.cmd';
const args = ['--permission-mode', 'bypassPermissions', '--model', 'claude-opus-4-8'];

const backend = process.argv[2] === 'winpty' ? 'winpty' : 'conpty';
const useConpty = backend === 'conpty';
const method = process.argv[3] || 'down';

const t0 = Date.now();
const stamp = () => ('+' + String(Date.now() - t0).padStart(6, ' ') + 'ms');
const esc = (s) => s.replace(/[\x00-\x1f\x7f]/g, (c) => (c === '\x1b' ? '\\e' : c === '\n' ? '\\n' : c === '\r' ? '\\r' : '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`${stamp()} spawn claude (${backend}, accept=${method})...`);
const p = pty.spawn(FILE, args, { name: 'xterm-256color', cols: 120, rows: 40, cwd: process.cwd(), env: process.env, useConpty });

let lastDataAt = Date.now();
let phase = 'startup';
let sawAccepted = false;   // proceeded past the warning (input box / "Yes I accept" gone)
let sawResponse = false;
p.onData((d) => {
  lastDataAt = Date.now();
  const plain = d.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
  if (phase === 'afterAccept' && /esc to interrupt|Thinking|PONG|pong|tokens|↑|esc to/i.test(plain)) sawResponse = true;
  console.log(`${stamp()} [${phase}] <<${d.length}b>> ${esc(d).slice(0, 160)}`);
});

async function waitQuiet(minQuiet, hardCapFromNow) {
  const start = Date.now();
  while (true) {
    await sleep(100);
    if (Date.now() - lastDataAt > minQuiet && Date.now() - start > 600) return;
    if (Date.now() - start > hardCapFromNow) return;
  }
}

(async () => {
  await waitQuiet(1000, 7000);
  console.log(`${stamp()} === accept warning via '${method}' ===`);
  phase = 'accepting';
  if (method === 'down') { p.write('\x1b[B'); await sleep(200); p.write('\r'); }
  else if (method === 'num') { p.write('2'); await sleep(200); p.write('\r'); }
  else { p.write('2'); }
  await waitQuiet(1200, 6000);
  console.log(`${stamp()} === send real prompt ===`);
  phase = 'afterAccept';
  p.write('reply with exactly: PONG');
  await sleep(250);
  p.write('\r');
  await sleep(8000);
  console.log(`${stamp()} === RESULT: sawResponse=${sawResponse} ===`);
  try { p.kill(); } catch {}
  setTimeout(() => process.exit(0), 400);
})();
