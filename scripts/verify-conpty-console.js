// Tests the hypothesis: ConPTY pty.spawn() deadlocks only when the host process
// has NO attached console (the VS Code extension-host condition). We spawn a
// worker two ways and have it call pty.spawn(conpty) + report a synchronous
// spawnMs. A multi-second spawnMs (or a frozen worker that never prints RESULT)
// == the deadlock.
//   mode A "console":  normal child (Windows auto-allocates a console)
//   mode B "noconsole": detached + CREATE_NO_WINDOW (no console, like ext host)
// Usage:  node verify-conpty-console.js worker        (internal)
//         node verify-conpty-console.js               (runs both modes)
const { spawn } = require('node:child_process');
const path = require('node:path');

if (process.argv[2] === 'worker') {
  const pty = require('../node_modules/node-pty');
  const FILE = 'C:\\Windows\\System32\\cmd.exe';
  const hasConsole = (() => { try { return process.stdout.columns !== undefined; } catch { return false; } })();
  process.stdout.write(`WORKER pid=${process.pid} hasConsoleHint=${hasConsole}\n`);
  process.stdout.write('WORKER calling pty.spawn(conpty)...\n');
  const t0 = Date.now();
  let p;
  try {
    p = pty.spawn(FILE, [], { name: 'xterm-256color', cols: 80, rows: 24, cwd: process.cwd(), env: process.env, useConpty: true });
  } catch (e) {
    process.stdout.write(`WORKER spawn THREW after ${Date.now() - t0}ms: ${e.message}\n`);
    process.exit(2);
  }
  const spawnMs = Date.now() - t0;
  process.stdout.write(`WORKER spawnMs=${spawnMs}\n`);
  let bytes = 0;
  p.onData((d) => { bytes += d.length; });
  setTimeout(() => {
    process.stdout.write(`WORKER RESULT spawnMs=${spawnMs} gotData=${bytes > 0} bytes=${bytes}\n`);
    try { p.kill(); } catch {}
    setTimeout(() => process.exit(0), 200);
  }, 3000);
  return;
}

const self = __filename;

function runWorker(mode) {
  return new Promise((resolve) => {
    const opts = mode === 'noconsole'
      ? { detached: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
      : { detached: false, windowsHide: false, stdio: ['ignore', 'pipe', 'pipe'] };
    console.log(`\n=== MODE: ${mode} (detached=${!!opts.detached}, windowsHide=${!!opts.windowsHide}) ===`);
    const t0 = Date.now();
    const child = spawn(process.execPath, [self, 'worker'], opts);
    let out = '';
    let printedResult = false;
    child.stdout.on('data', (d) => { out += d.toString(); process.stdout.write(`  ${d.toString().trimEnd()}\n`); if (/RESULT/.test(out)) printedResult = true; });
    child.stderr.on('data', (d) => process.stdout.write(`  [err] ${d.toString().trimEnd()}\n`));
    const watchdog = setTimeout(() => {
      console.log(`  !!! WATCHDOG: worker frozen ${Date.now() - t0}ms, printedResult=${printedResult} -> DEADLOCK in ${mode}`);
      try { process.kill(-child.pid); } catch {}
      try { child.kill(); } catch {}
      resolve();
    }, 8000);
    child.on('exit', (code) => { clearTimeout(watchdog); console.log(`  worker exited code=${code} after ${Date.now() - t0}ms`); resolve(); });
  });
}

(async () => {
  await runWorker('console');
  await runWorker('noconsole');
  console.log('\n=== DONE ===');
  process.exit(0);
})();
