// Decisive: does claude's TUI receive injected input under a given backend?
// Spawn the real claude, wait until its input box has rendered (detect a quiet
// window after the big render burst), then inject a short prompt and watch for
// (a) the typed text echoing into the input box and (b) any model response.
// Usage:  node verify-claude-inject.js [winpty|conpty]
const pty = require('../node_modules/node-pty');

const NPM = 'C:\\Users\\CQDD\\AppData\\Roaming\\npm';
const FILE = NPM + '\\claude.cmd';
const args = ['--permission-mode', 'bypassPermissions', '--model', 'claude-opus-4-8'];

const backend = process.argv[2] === 'conpty' ? 'conpty' : 'winpty';
const useConpty = backend === 'conpty';

const t0 = Date.now();
const stamp = () => ('+' + String(Date.now() - t0).padStart(6, ' ') + 'ms');
const esc = (s) => s.replace(/[\x00-\x1f\x7f]/g, (c) => (c === '\x1b' ? '\\e' : c === '\n' ? '\\n' : c === '\r' ? '\\r' : '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0')));

console.log(`${stamp()} spawn claude (${backend}, useConpty=${useConpty})...`);
const p = pty.spawn(FILE, args, { name: 'xterm-256color', cols: 120, rows: 40, cwd: process.cwd(), env: process.env, useConpty });
console.log(`${stamp()} spawn returned pid=${p.pid}`);

let totalBytes = 0;
let lastDataAt = Date.now();
let injected = false;
let sawEchoAfterInject = false;
let bytesAfterInject = 0;
const MSG = 'reply with the single word PONG';

p.onData((d) => {
  totalBytes += d.length;
  lastDataAt = Date.now();
  if (injected) {
    bytesAfterInject += d.length;
    if (d.includes('PONG') || d.includes('pong')) sawEchoAfterInject = true;
  }
  // Print a trimmed view so we can eyeball the input box / echo.
  console.log(`${stamp()} <<${d.length}b>> ${esc(d).slice(0, 120)}`);
});

// Inject only after a 1.2s quiet window (input box has settled), but no earlier
// than 2.5s and no later than 7s.
const startWait = Date.now();
const tick = setInterval(() => {
  const quietFor = Date.now() - lastDataAt;
  const elapsed = Date.now() - startWait;
  if (!injected && ((quietFor > 1200 && elapsed > 2500) || elapsed > 7000)) {
    injected = true;
    clearInterval(tick);
    console.log(`${stamp()} === INPUT BOX SETTLED (quietFor=${quietFor}ms, totalBytes=${totalBytes}) ===`);
    console.log(`${stamp()} >>> write message text (single line)`);
    p.write(MSG);
    setTimeout(() => { console.log(`${stamp()} >>> write '\\r' (submit)`); p.write('\r'); }, 300);
  }
}, 100);

setTimeout(() => {
  clearInterval(tick);
  console.log(`${stamp()} === RESULT: bytesAfterInject=${bytesAfterInject} sawPONG=${sawEchoAfterInject} ===`);
  console.log(`${stamp()} (if bytesAfterInject is large, claude reacted to input; if ~0, input never reached claude)`);
  try { p.kill(); } catch {}
  setTimeout(() => process.exit(0), 400);
}, 20000);
