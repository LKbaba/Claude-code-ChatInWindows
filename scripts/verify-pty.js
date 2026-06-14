// Dev-only smoke test: verify node-pty loads under the target Electron ABI and
// can spawn a process. Run with the VS Code Electron binary as Node:
//   ELECTRON_RUN_AS_NODE=1 "<path>/Code.exe" scripts/verify-pty.js
// Expected: prints the runtime ABI then a line of shell output, then "PTY OK".
const pty = require('node-pty');

console.log('runtime versions:', JSON.stringify({
  node: process.versions.node,
  electron: process.versions.electron,
  modules: process.versions.modules, // NODE_MODULE_VERSION (ABI)
}));

const shell = process.platform === 'win32' ? 'cmd.exe' : 'bash';
const args = process.platform === 'win32' ? ['/c', 'echo node-pty-smoke-test'] : ['-c', 'echo node-pty-smoke-test'];

const p = pty.spawn(shell, args, { name: 'xterm-256color', cols: 80, rows: 24, cwd: process.cwd(), env: process.env });

let out = '';
p.onData((d) => { out += d; });
p.onExit(({ exitCode }) => {
  process.stdout.write(out);
  console.log(`\nPTY OK (exitCode=${exitCode})`);
  process.exit(0);
});

setTimeout(() => { console.error('TIMEOUT: no exit'); process.exit(1); }, 8000);
