// Isolate the input path: does node-pty actually deliver our writes to the child?
// Spawn a plain interactive cmd.exe and type `echo INJECT_OK<CR>`. If we see
// INJECT_OK echoed/executed, the PTY write path works and any "no input" issue is
// specific to claude's TUI. Tests one backend per run: [winpty|conpty].
const pty = require('../node_modules/node-pty');

const backend = process.argv[2] === 'conpty' ? 'conpty' : 'winpty';
const useConpty = backend === 'conpty';

const t0 = Date.now();
const stamp = () => ('+' + String(Date.now() - t0).padStart(5, ' ') + 'ms');
const esc = (s) => s.replace(/[\x00-\x1f\x7f]/g, (c) => (c === '\x1b' ? '\\e' : c === '\n' ? '\\n' : c === '\r' ? '\\r' : '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0')));

console.log(`${stamp()} spawning cmd.exe (${backend})...`);
const p = pty.spawn('C:\\Windows\\System32\\cmd.exe', [], { name: 'xterm-256color', cols: 120, rows: 30, cwd: process.cwd(), env: process.env, useConpty });
console.log(`${stamp()} spawn returned pid=${p.pid}`);

let sawInjectOk = false;
p.onData((d) => {
  if (/INJECT_OK/.test(d)) sawInjectOk = true;
  console.log(`${stamp()} <<${d.length}b>> ${esc(d).slice(0, 100)}`);
});

setTimeout(() => { console.log(`${stamp()} >>> write 'echo INJECT_OK\\r'`); p.write('echo INJECT_OK\r'); }, 1500);

setTimeout(() => {
  console.log(`${stamp()} === RESULT: write path ${sawInjectOk ? 'WORKS (saw INJECT_OK)' : 'BROKEN (no INJECT_OK)'} ===`);
  try { p.kill(); } catch {}
  setTimeout(() => process.exit(0), 300);
}, 4000);
