// Task 7 DECISIVE probe: does the native `/compact` slash command actually
// trigger Claude Code's server-side compaction under PTY? The earlier
// verify-claude-compact.js saw only a `{"type":"queue-operation",...}` line and
// no context drop — but that was likely a FALSE NEGATIVE: `/compact` got
// ENQUEUED because the TUI was not truly idle when we injected it.
//
// This probe removes that ambiguity by installing a project-local PreCompact
// HOOK (mirroring StopHookFallbackService's idempotent injection, but into the
// temp-cwd `.claude/settings.json` so it is fully self-contained and never
// touches the user's real settings). The native PreCompact hook fires BEFORE
// compaction runs, with payload {session_id, transcript_path, trigger,
// custom_instructions}. If our sentinel file appears, compaction DID trigger —
// independent of whatever the transcript shows.
//
// Decisive flow:
//   spawn -> answer trust -> build a LARGE context (several long turns)
//   -> wait for BOTH the transcript AND the PTY output stream to go quiet
//      (true idle, so `/compact` is consumed, not queued)
//   -> inject `/compact` char-by-char (lets the slash menu filter) + Enter
//   -> watch for: (a) PreCompact sentinel file appearing  [proves trigger]
//                 (b) a summary/compact-boundary line in the transcript
//                 (c) the next turn's context dropping     [proves it shrank]
//
// RESULT route B viable if: sentinelFired=true (compaction triggered) AND
// (contextDropped=true OR a summary line was written). aliveAfterCompact stays
// true throughout (session is NOT killed by compaction).
//
// Usage:  node verify-claude-precompact.js [exe|cmd]
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

const CWD = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-precompact-'));

const t0 = Date.now();
const stamp = () => '+' + String(Date.now() - t0).padStart(6, ' ') + 'ms';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
const compact = (s) => stripAnsi(s).toLowerCase().replace(/[^a-z0-9]/g, '');

function encodeProjectSlug(cwd) { return cwd.replace(/[^a-zA-Z0-9]/g, '-'); }
function projectDir(cwd) { return path.join(os.homedir(), '.claude', 'projects', encodeProjectSlug(cwd)); }
function jsonlFiles() { try { return fs.readdirSync(projectDir(CWD)).filter((f) => f.endsWith('.jsonl')); } catch { return []; } }

// ---- PreCompact hook sentinel (project-local, fully self-contained) ----
// We write a temp-cwd `.claude/settings.json` whose PreCompact hook dumps its
// raw stdin payload to SENTINEL. This mirrors StopHookFallbackService's
// PowerShell base64 `-EncodedCommand` technique and anti-recursion shape.
const SENTINEL = path.join(CWD, '.precompact-fired.json');

function installPreCompactHook() {
  const settingsDir = path.join(CWD, '.claude');
  fs.mkdirSync(settingsDir, { recursive: true });
  // The hook writes whatever PreCompact sends on stdin to SENTINEL, so we can
  // both detect the fire AND inspect trigger/custom_instructions afterward.
  const ps = `$ErrorActionPreference = 'SilentlyContinue'
$in = [Console]::In.ReadToEnd()
Set-Content -LiteralPath '${SENTINEL.replace(/'/g, "''")}' -Value $in -Encoding UTF8
Write-Output '{}'`;
  const encoded = Buffer.from(ps, 'utf16le').toString('base64');
  const command = `powershell -NoProfile -EncodedCommand ${encoded}`;
  const settings = {
    hooks: {
      PreCompact: [
        { matcher: '', hooks: [{ type: 'command', command }] }
      ]
    }
  };
  fs.writeFileSync(path.join(settingsDir, 'settings.json'), JSON.stringify(settings, null, 2), 'utf8');
  console.log(`${stamp()} installed PreCompact hook -> ${SENTINEL}`);
}

function sentinelFired() { try { return fs.statSync(SENTINEL).size >= 0; } catch { return false; } }
function sentinelPayload() { try { return fs.readFileSync(SENTINEL, 'utf8'); } catch { return ''; } }

function allLines() {
  const dir = projectDir(CWD);
  const out = [];
  try {
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.jsonl'))) {
      let txt = '';
      try { txt = fs.readFileSync(path.join(dir, f), 'utf8'); } catch { continue; }
      for (const line of txt.split('\n')) {
        if (!line.trim()) continue;
        try { out.push({ file: f, obj: JSON.parse(line), raw: line }); } catch { /* partial */ }
      }
    }
  } catch { /* none */ }
  return out;
}

function totalTranscriptSize() {
  const dir = projectDir(CWD);
  let total = 0;
  try { for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.jsonl'))) { try { total += fs.statSync(path.join(dir, f)).size; } catch {} } } catch {}
  return total;
}

function assistantTurnCount() {
  let n = 0;
  for (const { obj } of allLines()) {
    const sr = obj?.message?.stop_reason;
    if (obj.type === 'assistant' && (sr === 'end_turn' || sr === 'stop_sequence')) n++;
  }
  return n;
}

function lastAssistantContext() {
  let last = 0;
  for (const { obj } of allLines()) {
    if (obj.type !== 'assistant') continue;
    const u = obj?.message?.usage;
    if (!u) continue;
    const ctx = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
    if (ctx > 0) last = ctx;
  }
  return last;
}

function peakAssistantContext() {
  let peak = 0;
  for (const { obj } of allLines()) {
    if (obj.type !== 'assistant') continue;
    const u = obj?.message?.usage;
    if (!u) continue;
    const ctx = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
    if (ctx > peak) peak = ctx;
  }
  return peak;
}

let buffer = '';
let trustHandled = false;
let exited = false;
let lastDataAt = Date.now();
const args = ['--permission-mode', 'bypassPermissions', '--model', 'claude-opus-4-8'];

installPreCompactHook();

const p = pty.spawn(FILE, args, { name: 'xterm-256color', cols: 120, rows: 40, cwd: CWD, env: process.env, useConpty: false });
p.onExit(() => { exited = true; });
console.log(`${stamp()} spawn ${which}, cwd=${CWD}`);

p.onData((d) => {
  lastDataAt = Date.now();
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

function injectOnce(text) {
  p.write(`\x1b[200~${text}\x1b[201~`);
  return sleep(PASTE_DELAY_MS).then(() => p.write('\r'));
}

async function injectUntilTurns(text, target, budgetMs) {
  const deadline = Date.now() + budgetMs;
  let nextAt = 0;
  while (Date.now() < deadline) {
    if (assistantTurnCount() >= target) return true;
    if (Date.now() >= nextAt) { await injectOnce(text); nextAt = Date.now() + REINJECT_INTERVAL_MS; }
    await sleep(300);
  }
  return assistantTurnCount() >= target;
}

async function waitQuiescent(quietMs, budgetMs) {
  const deadline = Date.now() + budgetMs;
  let last = totalTranscriptSize();
  let lastChange = Date.now();
  while (Date.now() < deadline) {
    await sleep(400);
    const now = totalTranscriptSize();
    if (now !== last) { last = now; lastChange = Date.now(); }
    else if (Date.now() - lastChange >= quietMs) return true;
  }
  return false;
}

// Stronger idle gate: BOTH transcript size AND the PTY output stream must be
// quiet for quietMs. The earlier probe's `queue-operation enqueue` suggests
// `/compact` was injected while the TUI was still busy; gating on the raw
// output stream (lastDataAt) closes that race.
async function waitTrulyIdle(quietMs, budgetMs) {
  const deadline = Date.now() + budgetMs;
  let lastSize = totalTranscriptSize();
  let lastSizeChange = Date.now();
  while (Date.now() < deadline) {
    await sleep(300);
    const now = totalTranscriptSize();
    if (now !== lastSize) { lastSize = now; lastSizeChange = Date.now(); }
    const streamQuietFor = Date.now() - lastDataAt;
    const sizeQuietFor = Date.now() - lastSizeChange;
    if (streamQuietFor >= quietMs && sizeQuietFor >= quietMs) return true;
  }
  return false;
}

(async () => {
  await sleep(2500);

  // Build a LARGE context so compaction has something substantial to compress.
  await injectUntilTurns('Write a detailed 8-paragraph explanation of how TCP congestion control works (slow start, congestion avoidance, fast retransmit, fast recovery).', 1, 60000);
  await waitQuiescent(2500, 30000);
  await injectUntilTurns('Now write another 8 paragraphs explaining how TLS 1.3 handshake works, in detail.', 2, 60000);
  await waitQuiescent(2500, 30000);
  await injectUntilTurns('Now write 8 more paragraphs on how BGP path selection and route propagation works across autonomous systems.', 3, 60000);
  await waitQuiescent(2500, 30000);

  const filesBefore = jsonlFiles().slice();
  const sizeBefore = totalTranscriptSize();
  const turnsBefore = assistantTurnCount();
  const peakBefore = peakAssistantContext();
  const lastBefore = lastAssistantContext();
  const linesBefore = allLines().length;
  console.log(`${stamp()} PRE-compact: files=${filesBefore.length} size=${sizeBefore} turns=${turnsBefore} peakContext=${peakBefore} lastContext=${lastBefore} lines=${linesBefore}`);

  // ---- Ensure the TUI is TRULY idle before injecting /compact ----
  const idle = await waitTrulyIdle(2500, 20000);
  console.log(`${stamp()} trulyIdle=${idle} (streamQuietFor=${Date.now() - lastDataAt}ms)`);

  // ---- Inject the native /compact slash command (char-by-char) ----
  console.log(`${stamp()} >>> injecting /compact (char-by-char)`);
  for (const ch of '/compact') { p.write(ch); await sleep(60); }
  await sleep(1000);
  p.write('\r');

  // Compaction is server-side; poll for the PreCompact hook firing first (the
  // decisive signal), then for transcript settle.
  let firedAt = 0;
  {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      if (sentinelFired()) { firedAt = Date.now(); break; }
      await sleep(300);
    }
  }
  console.log(`${stamp()} PreCompact sentinelFired=${firedAt > 0}`);
  if (firedAt > 0) {
    console.log(`${stamp()} PreCompact payload: ${sentinelPayload().slice(0, 400)}`);
  }

  await sleep(4000);
  const compacted = await waitQuiescent(4000, 120000);
  console.log(`${stamp()} post-/compact quiescent=${compacted} aliveAfterCompact=${!exited}`);

  // Dump RAW new lines so we can see exactly what /compact wrote.
  {
    const dumpLines = allLines().slice(linesBefore);
    console.log(`${stamp()} --- RAW new lines after /compact (${dumpLines.length}) ---`);
    for (const { file, raw } of dumpLines.slice(0, 14)) {
      console.log(`${stamp()}   [${file}] ${raw.slice(0, 300)}`);
    }
  }

  const filesAfter = jsonlFiles().slice();
  const newFiles = filesAfter.filter((f) => !filesBefore.includes(f));
  const lines = allLines();
  const newLines = lines.slice(linesBefore);

  // Surface any line that looks like a compaction boundary/summary.
  const markerLines = lines.filter(({ obj, raw }) => {
    const t = (obj.type || '').toLowerCase();
    const low = raw.toLowerCase();
    return t.includes('summary') || t.includes('compact') ||
      obj.isCompactSummary === true || obj.isCompact === true ||
      low.includes('iscompactsummary') || low.includes('"compact"') || low.includes('compactmetadata');
  });
  console.log(`${stamp()} files after compact: [${filesAfter.join(', ')}] newFiles=[${newFiles.join(', ')}] markerLines=${markerLines.length}`);
  for (const m of markerLines.slice(0, 4)) {
    const keys = Object.keys(m.obj).join(',');
    console.log(`${stamp()}   marker[file=${m.file} type=${m.obj.type} keys=${keys}] :: ${m.raw.slice(0, 240)}`);
  }
  const newTypes = {};
  for (const { obj } of newLines) { const t = obj.type || '(none)'; newTypes[t] = (newTypes[t] || 0) + 1; }
  console.log(`${stamp()} new-line type histogram: ${JSON.stringify(newTypes)}`);

  // ---- One more turn AFTER compact: measure whether context fell ----
  const turnsAfterCompactMarker = assistantTurnCount();
  await injectUntilTurns('In one sentence, what were the topics we discussed before this?', turnsAfterCompactMarker + 1, 45000);
  await waitQuiescent(2500, 30000);
  const lastAfter = lastAssistantContext();
  const dropped = lastBefore > 0 && lastAfter > 0 && lastAfter < lastBefore;
  const dropPct = lastBefore > 0 ? Math.round((1 - lastAfter / lastBefore) * 100) : 0;

  console.log(`${stamp()} POST-compact next turn: lastContext ${lastBefore} -> ${lastAfter} (drop ${dropPct}%)`);
  const sentinel = firedAt > 0;
  const viable = sentinel && (dropped || markerLines.length > 0);
  console.log(`${stamp()} === RESULT sentinelFired=${sentinel} alive=${!exited} contextDropped=${dropped} dropPct=${dropPct}% markerLines=${markerLines.length} newFiles=${newFiles.length} routeBViable=${viable} ===`);
  console.log(`${stamp()} (route B viable if PreCompact hook fired AND (context dropped OR a summary line was written), with the session staying alive)`);

  // ---- Full structural post-mortem: list every line's type + key fields so we
  // can see EXACTLY how compaction is recorded (boundary line shape, summary
  // placement, any isCompact* flags) to design the UI backfill. ----
  console.log(`${stamp()} ===== FULL TRANSCRIPT STRUCTURE (${lines.length} lines) =====`);
  for (let i = 0; i < lines.length; i++) {
    const { obj } = lines[i];
    const t = obj.type || '(none)';
    const sub = obj.subtype ? `/${obj.subtype}` : '';
    const flags = [];
    if (obj.isCompactSummary) flags.push('isCompactSummary');
    if (obj.isCompact) flags.push('isCompact');
    if (obj.isMeta) flags.push('isMeta');
    const role = obj?.message?.role ? ` role=${obj.message.role}` : '';
    const sr = obj?.message?.stop_reason ? ` sr=${obj.message.stop_reason}` : '';
    // show a short content preview for user/summary lines (compaction summary
    // usually rides on a user-role message flagged isCompactSummary)
    let preview = '';
    const c = obj?.message?.content;
    if (typeof c === 'string') preview = c.slice(0, 80);
    else if (Array.isArray(c)) { const tx = c.find(x => x.type === 'text'); if (tx) preview = (tx.text || '').slice(0, 80); }
    if (typeof obj.summary === 'string') preview = obj.summary.slice(0, 80);
    console.log(`${stamp()}   [${String(i).padStart(3)}] ${t}${sub}${role}${sr} ${flags.join(',')} ${preview ? ':: ' + preview.replace(/\n/g, ' ') : ''}`);
  }
  // Also explicitly grep for any key whose name mentions compact/summary.
  const compactish = lines.filter(({ raw }) => /compact|summary/i.test(raw));
  console.log(`${stamp()} lines mentioning compact/summary: ${compactish.length}`);
  console.log(`${stamp()} TRANSCRIPT PRESERVED AT: ${projectDir(CWD)}`);

  try { p.kill(); } catch {}
  // NOTE: intentionally NOT deleting CWD so the transcript can be inspected.
  setTimeout(() => { process.exit(viable ? 0 : 1); }, 500);
})();
