// Task 5 probe: newSession leaves NO orphan processes. Mirrors
// ClaudeProcessService.endSession (read this._pty.pid, run `taskkill /pid <pid>
// /t /f`, then this._pty.kill()) across several spawn->kill cycles, exactly like
// repeatedly hitting "New Session". For each cycle it:
//   (1) spawns the interactive claude PTY (winpty backend, useConpty:false — same
//       options the extension uses);
//   (2) injects one turn so the FULL child tree materializes
//       (winpty-agent.exe -> claude.cmd -> cmd.exe -> node);
//   (3) snapshots every DESCENDANT pid of the PTY root BEFORE killing;
//   (4) runs the extension's exact kill (`taskkill /pid <root> /t /f` + pty.kill);
//   (5) verifies every snapshotted descendant pid is GONE (no orphan).
// It keys off the spawn's own descendant pids (not a global claude/node count),
// so it is immune to other claude sessions the user may have running.
//
// Usage:  node verify-claude-orphans.js [exe|cmd] [cycles]
const pty = require('../node_modules/node-pty');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const NATIVE = 'C:\\Users\\CQDD\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Anthropic.ClaudeCode_Microsoft.Winget.Source_8wekyb3d8bbwe\\claude.exe';
const NPM_CMD = 'C:\\Users\\CQDD\\AppData\\Roaming\\npm\\claude.cmd';
const which = process.argv[2] === 'cmd' ? 'cmd' : 'exe';
const FILE = which === 'cmd' ? NPM_CMD : NATIVE;
const CYCLES = Math.max(1, parseInt(process.argv[3], 10) || 5);

const PASTE_DELAY_MS = 250;

const t0 = Date.now();
const stamp = () => '+' + String(Date.now() - t0).padStart(6, ' ') + 'ms';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
const compact = (s) => stripAnsi(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// One PowerShell call -> the full ProcessId/ParentProcessId table. Walk it in JS
// to collect every transitive descendant of `root`. This is how we identify the
// exact subtree the extension's `taskkill /t` is responsible for reaping.
function processTable() {
  try {
    const out = cp.execSync(
      'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Csv -NoTypeInformation"',
      { encoding: 'utf8', windowsHide: true, timeout: 15000 }
    );
    const rows = [];
    for (const line of out.split(/\r?\n/)) {
      const m = line.match(/^"?(\d+)"?,"?(\d+)"?$/);
      if (m) rows.push({ pid: Number(m[1]), ppid: Number(m[2]) });
    }
    return rows;
  } catch { return []; }
}

function descendantsOf(root, table) {
  const childrenOf = new Map();
  for (const { pid, ppid } of table) {
    if (!childrenOf.has(ppid)) childrenOf.set(ppid, []);
    childrenOf.get(ppid).push(pid);
  }
  const seen = new Set();
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop();
    for (const child of childrenOf.get(cur) || []) {
      if (!seen.has(child)) { seen.add(child); stack.push(child); }
    }
  }
  return seen; // does NOT include root itself
}

function alivePids(pids) {
  if (!pids.size) return new Set();
  const table = processTable();
  const live = new Set(table.map((r) => r.pid));
  const stillAlive = new Set();
  for (const pid of pids) if (live.has(pid)) stillAlive.add(pid);
  return stillAlive;
}

// Mirror of WindowsCompatibility.killProcess(pid): taskkill /pid <pid> /t /f.
function taskkillTree(pid) {
  return new Promise((resolve) => {
    cp.exec(`taskkill /pid ${pid} /t /f`, () => resolve());
  });
}

async function runCycle(n) {
  const CWD = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-orphan-'));
  const args = ['--permission-mode', 'bypassPermissions', '--model', 'claude-opus-4-8'];

  let buffer = '';
  let trustHandled = false;
  const p = pty.spawn(FILE, args, { name: 'xterm-256color', cols: 120, rows: 40, cwd: CWD, env: process.env, useConpty: false });
  const root = p.pid;
  console.log(`${stamp()} [cycle ${n}] spawn ${which}, rootPid=${root}, cwd=${CWD}`);

  p.onData((d) => {
    buffer = (buffer + d).slice(-16000);
    if (!trustHandled) {
      const c = compact(buffer);
      if (c.includes('yesitrustthisfolder') && c.includes('noexit')) {
        trustHandled = true; p.write('\r');
      } else if (c.includes('yesiaccept') && c.includes('noexit')) {
        trustHandled = true; p.write('\x1b[B'); setTimeout(() => p.write('\r'), 200);
      }
    }
  });

  // Give the session time to start and materialize its child tree, then inject a
  // turn so node (the actual claude process under cmd.exe) is definitely running.
  await sleep(3000);
  p.write('\x1b[200~reply with exactly: ORPHAN-OK\x1b[201~');
  await sleep(PASTE_DELAY_MS);
  p.write('\r');
  await sleep(4000);

  // Snapshot the subtree BEFORE killing.
  const table = processTable();
  const descBefore = descendantsOf(root, table);
  const rootAlive = new Set(table.map((r) => r.pid)).has(root);
  console.log(`${stamp()} [cycle ${n}] rootAlive=${rootAlive} descendants=${descBefore.size} [${[...descBefore].join(', ')}]`);

  // Kill exactly like endSession: taskkill /t /f on the root, then pty.kill().
  await taskkillTree(root);
  try { p.kill(); } catch { /* may already be dead */ }

  // Give Windows a moment to reap, then check the whole subtree (root + descendants).
  await sleep(2000);
  const watch = new Set([root, ...descBefore]);
  const survivors = alivePids(watch);
  const clean = survivors.size === 0;
  console.log(`${stamp()} [cycle ${n}] survivors=${survivors.size} ${clean ? 'CLEAN' : '[ORPHANS: ' + [...survivors].join(', ') + ']'}`);

  try { fs.rmSync(CWD, { recursive: true, force: true }); } catch {}
  return { clean, rootAlive, descendants: descBefore.size, survivors: survivors.size };
}

(async () => {
  if (process.platform !== 'win32') {
    console.log('This probe targets Windows taskkill /t /f orphan reaping; skipping on non-Windows.');
    process.exit(0);
  }
  let allClean = true;
  let allStarted = true;
  let maxDescendants = 0;
  for (let i = 1; i <= CYCLES; i++) {
    const r = await runCycle(i);
    if (!r.rootAlive) allStarted = false;
    if (r.descendants > maxDescendants) maxDescendants = r.descendants;
    if (!r.clean) allClean = false;
    await sleep(500);
  }
  // sessionsStarted guards against a vacuous pass: the root PTY process must have
  // actually been alive before the kill (otherwise "no survivors" proves nothing).
  // The native single-binary claude.exe has 0 descendants but is still a real
  // process that must be reaped; the cmd path adds a node child (descendants>=1).
  console.log(`${stamp()} === RESULT cycles=${CYCLES} sessionsStarted=${allStarted} maxDescendants=${maxDescendants} noOrphans=${allClean} ===`);
  console.log(`${stamp()} (noOrphans: every spawned subtree — root + descendants — fully reaped by taskkill /t /f across all newSession cycles)`);
  process.exit(allClean && allStarted ? 0 : 1);
})();
