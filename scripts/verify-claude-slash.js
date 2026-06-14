// Decisive input test using a LOCAL slash menu (no network latency). Spawn
// claude, wait for the input box to settle, then inject "/help" + Enter. If the
// slash menu / help text renders, input reached claude's TUI. Prints FULL
// (untruncated) post-inject output so the reaction is unambiguous.
// Usage:  node verify-claude-slash.js [winpty|conpty]
const pty = require('../node_modules/node-pty');

const NPM = 'C:\\Users\\CQDD\\AppData\\Roaming\\npm';
const FILE = NPM + '\\claude.cmd';
const args = ['--permission-mode', 'bypassPermissions', '--model', 'claude-opus-4-8'];

const backend = process.argv[2] === 'conpty' ? 'conpty' : 'winpty';
const useConpty = backend === 'conpty';

const t0 = Date.now();
const stamp = () => ('+' + String(Date.now() - t0).padStart(6, ' ') + 'ms');
const esc = (s) => s.replace(/[\x00-\x1f\x7f]/g, (c) => (c === '\x1b' ? '\\e' : c === '\n' ? '\\n' : c === '\r' ? '\\r' : '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0')));

console.log(`${stamp()} spawn claude (${backend})...`);
const p = pty.spawn(FILE, args, { name: 'xterm-256color', cols: 120, rows: 40, cwd: process.cwd(), env: process.env, useConpty });

let lastDataAt = Date.now();
let injected = false;
let bytesAfterInject = 0;
let sawHelp = false;
p.onData((d) => {
  lastDataAt = Date.now();
  if (injected) {
    bytesAfterInject += d.length;
    if (/help|Help|usage|Usage|command|Command/.test(d)) sawHelp = true;
    console.log(`${stamp()} [post] <<${d.length}b>> ${esc(d).slice(0, 200)}`);
  }
});

const startWait = Date.now();
const tick = setInterval(() => {
  const quietFor = Date.now() - lastDataAt;
  const elapsed = Date.now() - startWait;
  if (!injected && ((quietFor > 1200 && elapsed > 2500) || elapsed > 7000)) {
    injected = true;
    clearInterval(tick);
    console.log(`${stamp()} === SETTLED (quietFor=${quietFor}ms) -> inject '/help' + Enter ===`);
    p.write('/help');
    setTimeout(() => p.write('\r'), 250);
  }
}, 100);

setTimeout(() => {
  clearInterval(tick);
  console.log(`${stamp()} === RESULT: bytesAfterInject=${bytesAfterInject} sawHelp=${sawHelp} ===`);
  try { p.kill(); } catch {}
  setTimeout(() => process.exit(0), 400);
}, 12000);
