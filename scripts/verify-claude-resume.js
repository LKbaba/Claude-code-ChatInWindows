// Task 8 probe: loadConversation (--resume) appends to the SAME transcript file.
// The extension's resume path (ClaudeProcessService.startProcess lines ~200-207)
// assumes `claude --resume <sessionId>` continues writing to the existing
// `<sessionId>.jsonl`, and tails it from its current byte size. This probe proves
// that assumption end-to-end:
//   Phase 1 (fresh): spawn claude, answer trust, inject turn1, wait for an
//     assistant turn, let the transcript flush. Record the session file
//     (basename = sessionId) and its size.
//   Phase 2 (resume): spawn `claude --resume <sessionId>`, inject turn2, and
//     verify (a) NO new jsonl was created in the (unique) project dir, (b) the
//     SAME <sessionId>.jsonl GREW, and (c) a NEW assistant turn was appended
//     beyond phase-1's count (resume continued the same conversation).
// Each run uses a fresh mkdtemp cwd, so the project slug dir starts empty and
// should contain EXACTLY ONE jsonl throughout — an unambiguous "same file" check.
//
// Usage:  node verify-claude-resume.js [exe|cmd]
const pty = require('../node_modules/node-pty');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const NATIVE = 'C:\\Users\\CQDD\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Anthropic.ClaudeCode_Microsoft.Winget.Source_8wekyb3d8bbwe\\claude.exe';
const NPM_CMD = 'C:\\Users\\CQDD\\AppData\\Roaming\\npm\\claude.cmd';
const which = process.argv[2] === 'cmd' ? 'cmd' : 'exe';
const FILE = which === 'cmd' ? NPM_CMD : NATIVE;

const PASTE_DELAY_MS = 250;
const REINJECT_INTERVAL_MS = 3500;

const CWD = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-resume-'));

const t0 = Date.now();
const stamp = () => '+' + String(Date.now() - t0).padStart(6, ' ') + 'ms';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
const compact = (s) => stripAnsi(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// Mirror TranscriptLocator.encodeProjectSlug / getProjectDir: every non-alnum
// char of the absolute cwd becomes '-'; file is <sessionId>.jsonl under it.
function encodeProjectSlug(cwd) { return cwd.replace(/[^a-zA-Z0-9]/g, '-'); }
function projectDir(cwd) { return path.join(os.homedir(), '.claude', 'projects', encodeProjectSlug(cwd)); }

function jsonlFiles() {
  const dir = projectDir(CWD);
  try { return fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')); }
  catch { return []; }
}

function fileSize(file) {
  try { return fs.statSync(file).size; } catch { return -1; }
}

// Count assistant end_turn/stop_sequence turns in a specific transcript file.
function assistantTurnsIn(file) {
  let count = 0;
  try {
    const txt = fs.readFileSync(file, 'utf8');
    for (const line of txt.split('\n')) {
      if (!line.trim()) continue;
      try {
        const o = JSON.parse(line);
        const sr = o?.message?.stop_reason;
        if (o.type === 'assistant' && (sr === 'end_turn' || sr === 'stop_sequence')) count++;
      } catch { /* partial line */ }
    }
  } catch { /* gone */ }
  return count;
}

// Spawn a claude PTY in CWD with the given extra args; auto-answer the trust /
// bypass gate. Returns the IPty.
function spawnClaude(extraArgs) {
  const args = ['--permission-mode', 'bypassPermissions', '--model', 'claude-opus-4-8', ...extraArgs];
  let buffer = '';
  let trustHandled = false;
  const p = pty.spawn(FILE, args, { name: 'xterm-256color', cols: 120, rows: 40, cwd: CWD, env: process.env, useConpty: false });
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
  return p;
}

function injectOnce(p, text) {
  p.write(`\x1b[200~${text}\x1b[201~`);
  return sleep(PASTE_DELAY_MS).then(() => p.write('\r'));
}

// Inject `text` (with light re-injection like the watchdog) until `done()` is
// true or the budget expires. Returns whether `done()` became true.
async function injectUntil(p, text, done, budgetMs) {
  const deadline = Date.now() + budgetMs;
  let nextAt = 0;
  while (Date.now() < deadline) {
    if (done()) return true;
    if (Date.now() >= nextAt) { await injectOnce(p, text); nextAt = Date.now() + REINJECT_INTERVAL_MS; }
    await sleep(300);
  }
  return done();
}

// Wait until `file` stops growing for quietMs (transcript flushed).
async function waitFileQuiescent(file, quietMs, budgetMs) {
  const deadline = Date.now() + budgetMs;
  let last = fileSize(file);
  let lastChange = Date.now();
  while (Date.now() < deadline) {
    await sleep(400);
    const now = fileSize(file);
    if (now !== last) { last = now; lastChange = Date.now(); }
    else if (Date.now() - lastChange >= quietMs) return true;
  }
  return false;
}

(async () => {
  // ---- Phase 1: fresh session, capture the session file ----
  console.log(`${stamp()} phase1 spawn fresh, cwd=${CWD}`);
  const p1 = spawnClaude([]);
  await sleep(2500);

  // Inject turn1; the fresh transcript appears once the first prompt is accepted.
  const landed1 = await injectUntil(
    p1,
    'reply with exactly: RESUME1',
    () => jsonlFiles().length >= 1 && assistantTurnsIn(path.join(projectDir(CWD), jsonlFiles()[0])) >= 1,
    40000
  );
  const files1 = jsonlFiles();
  if (!landed1 || files1.length !== 1) {
    console.log(`${stamp()} phase1 FAILED landed=${landed1} files=${files1.length} [${files1.join(', ')}]`);
    try { p1.kill(); } catch {}
    setTimeout(() => { try { fs.rmSync(CWD, { recursive: true, force: true }); } catch {} process.exit(1); }, 500);
    return;
  }
  const sessionId = files1[0].replace(/\.jsonl$/, '');
  const sessionFile = path.join(projectDir(CWD), files1[0]);
  await waitFileQuiescent(sessionFile, 2500, 20000);
  const turnsP1 = assistantTurnsIn(sessionFile);
  const sizeP1 = fileSize(sessionFile);
  console.log(`${stamp()} phase1 sessionId=${sessionId} turns=${turnsP1} size=${sizeP1}`);

  // End the session (like endSession before a resume).
  try { p1.kill(); } catch {}
  await sleep(2500);

  // ---- Phase 2: resume the SAME session, inject turn2 ----
  console.log(`${stamp()} phase2 spawn --resume ${sessionId}`);
  const p2 = spawnClaude(['--resume', sessionId]);
  await sleep(3000);

  const landed2 = await injectUntil(
    p2,
    'reply with exactly: RESUME2',
    () => assistantTurnsIn(sessionFile) > turnsP1,
    45000
  );
  await waitFileQuiescent(sessionFile, 2500, 20000);

  const filesAfter = jsonlFiles();
  const turnsP2 = assistantTurnsIn(sessionFile);
  const sizeP2 = fileSize(sessionFile);

  const sameFileOnly = filesAfter.length === 1 && filesAfter[0] === files1[0]; // no new jsonl
  const grew = sizeP2 > sizeP1;                 // resume appended to the same file
  const newTurn = turnsP2 > turnsP1;            // a fresh assistant turn landed on resume

  console.log(`${stamp()} phase2 filesNow=${filesAfter.length} [${filesAfter.join(', ')}] turns=${turnsP2} size=${sizeP2}`);
  console.log(`${stamp()} sameFileOnly=${sameFileOnly} grew=${grew} newTurn=${newTurn} (landed2=${landed2})`);
  const ok = sameFileOnly && grew && newTurn;
  console.log(`${stamp()} === RESULT resumeAppendsSameFile=${ok} ===`);
  console.log(`${stamp()} (ok: --resume continued the same <sessionId>.jsonl with a new turn, no new transcript spawned — extension's tail-from-offset assumption holds)`);

  try { p2.kill(); } catch {}
  setTimeout(() => { try { fs.rmSync(CWD, { recursive: true, force: true }); } catch {} process.exit(ok ? 0 : 1); }, 500);
})();
