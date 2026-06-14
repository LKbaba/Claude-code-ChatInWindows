// Decisive probe: does pty.spawn() block synchronously in the CURRENT runtime?
// Run a single backend per invocation so a synchronous hang in one cannot mask
// the other. Usage:  <node-or-electron> verify-pty-spawn.js [conpty|winpty]
// Prints spawnMs (synchronous time inside pty.spawn) and whether the TUI emitted
// any data within 4s. A multi-second spawnMs (or a frozen process) == the hang.
const pty = require('../node_modules/node-pty');

const NPM = 'C:\\Users\\CQDD\\AppData\\Roaming\\npm';
const FILE = NPM + '\\claude.cmd';

const LONG_NL_PROMPT = '# MCP Tools Available\n' +
  Array.from({ length: 40 }, (_, i) => `## Server ${i}\n**Purpose**: line ${i} with newline`).join('\n');
const args = ['--permission-mode', 'bypassPermissions', '--model', 'claude-opus-4-8', '--append-system-prompt', LONG_NL_PROMPT];

const backend = process.argv[2] === 'winpty' ? 'winpty' : 'conpty';
const useConpty = backend === 'conpty';

console.log(`runtime: node=${process.versions.node} electron=${process.versions.electron || 'none'} modules=${process.versions.modules}`);
console.log(`backend: ${backend} (useConpty=${useConpty})`);
console.log('calling pty.spawn() now...');

const t0 = Date.now();
let p;
try {
  p = pty.spawn(FILE, args, { name: 'xterm-256color', cols: 120, rows: 30, cwd: process.cwd(), env: process.env, useConpty });
} catch (e) {
  console.log(`spawn THREW after ${Date.now() - t0}ms: ${e.message}`);
  process.exit(2);
}
const spawnMs = Date.now() - t0;
console.log(`pty.spawn() returned after ${spawnMs}ms (synchronous)`);

let bytes = 0, firstMs = -1;
const tData = Date.now();
p.onData((d) => { if (firstMs < 0) firstMs = Date.now() - tData; bytes += d.length; });

setTimeout(() => {
  console.log(`result: gotData=${bytes > 0} firstDataMs=${firstMs} bytes=${bytes}`);
  try { p.kill(); } catch {}
  setTimeout(() => process.exit(0), 300);
}, 4000);
