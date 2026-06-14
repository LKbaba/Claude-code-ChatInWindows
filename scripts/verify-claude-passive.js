// Passive observation: spawn claude, inject NOTHING, just watch all output and
// the exit event for 12s. Distinguishes "claude exits on its own" from "claude
// exits because of injected input". Prints full untruncated output.
// Usage:  node verify-claude-passive.js [winpty|conpty]
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
console.log(`${stamp()} pid=${p.pid}`);

p.onData((d) => { console.log(`${stamp()} <<${d.length}b>> ${esc(d)}`); });
p.onExit(({ exitCode, signal }) => { console.log(`${stamp()} *** onExit code=${exitCode} signal=${signal} ***`); });

setTimeout(() => {
  console.log(`${stamp()} === END (no input was ever sent) ===`);
  try { p.kill(); } catch {}
  setTimeout(() => process.exit(0), 400);
}, 12000);
