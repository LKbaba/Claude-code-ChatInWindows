// Task 7 probe: characterize the NATIVE `/compact` slash command under PTY, to
// decide compact route A (extension self-summarizes + newSession) vs B (inject
// `/compact`, server-side compaction, session stays alive). It answers the three
// PLAN questions:
//   (1) How does /compact land in the transcript? (new file? a summary/compact
//       marker line? same file appended?) — we dump any line whose type or keys
//       mention "summary"/"compact".
//   (2) Does token occupancy fall after compaction? — we measure each assistant
//       turn's context size (input + cache_creation + cache_read) and compare the
//       PRE-compact peak against the FIRST post-compact turn.
//   (3) What must the UI backfill? — informed by (1): whether a summary line is
//       emitted we can render, and whether the session/file continues.
//
// Flow: spawn -> build context with a couple of sizeable turns (record peak
// context) -> inject `/compact` + Enter -> wait quiescent -> dump new transcript
// lines -> inject one more short turn -> measure its context size. Session staying
// alive + a sharp context drop => route B viable.
//
// Usage:  node verify-claude-compact.js [exe|cmd]
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

const CWD = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-compact-'));

const t0 = Date.now();
const stamp = () => '+' + String(Date.now() - t0).padStart(6, ' ') + 'ms';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
const compact = (s) => stripAnsi(s).toLowerCase().replace(/[^a-z0-9]/g, '');

function encodeProjectSlug(cwd) { return cwd.replace(/[^a-zA-Z0-9]/g, '-'); }
function projectDir(cwd) { return path.join(os.homedir(), '.claude', 'projects', encodeProjectSlug(cwd)); }
function jsonlFiles() { try { return fs.readdirSync(projectDir(CWD)).filter((f) => f.endsWith('.jsonl')); } catch { return []; } }

// Parse every transcript jsonl line in the project dir into objects, with the
// source file name attached (so we can tell same-file vs new-file behavior).
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

// Context size of an assistant message = input + cache_creation + cache_read
// (the full prompt-side context that turn saw). Returns the LAST assistant
// message's context size, i.e. the most recent context occupancy.
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
const args = ['--permission-mode', 'bypassPermissions', '--model', 'claude-opus-4-8'];
const p = pty.spawn(FILE, args, { name: 'xterm-256color', cols: 120, rows: 40, cwd: CWD, env: process.env, useConpty: false });
p.onExit(() => { exited = true; });
console.log(`${stamp()} spawn ${which}, cwd=${CWD}`);

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

(async () => {
  await sleep(2500);

  // Build context: two sizeable turns so the context (cache) is non-trivial.
  await injectUntilTurns('Write a detailed 8-paragraph explanation of how TCP congestion control works (slow start, congestion avoidance, fast retransmit, fast recovery).', 1, 60000);
  await waitQuiescent(2500, 30000);
  await injectUntilTurns('Now write another 8 paragraphs explaining how TLS 1.3 handshake works, in detail.', 2, 60000);
  await waitQuiescent(2500, 30000);

  const filesBefore = jsonlFiles().slice();
  const sizeBefore = totalTranscriptSize();
  const turnsBefore = assistantTurnCount();
  const peakBefore = peakAssistantContext();
  const lastBefore = lastAssistantContext();
  const linesBefore = allLines().length;
  console.log(`${stamp()} PRE-compact: files=${filesBefore.length} size=${sizeBefore} turns=${turnsBefore} peakContext=${peakBefore} lastContext=${lastBefore} lines=${linesBefore}`);

  // ---- Inject the native /compact slash command ----
  // Type it char-by-char so the TUI slash-command menu filters to /compact,
  // then Enter to run it (a fast single write can race the menu open).
  console.log(`${stamp()} >>> injecting /compact (char-by-char)`);
  for (const ch of '/compact') { p.write(ch); await sleep(40); }
  await sleep(800);
  p.write('\r');

  // /compact does server-side summarization; give it time, then wait quiescent.
  // Poll the transcript for up to ~120s watching for context shrink / new files /
  // new line types, since compaction can lag well behind the keystroke.
  await sleep(4000);
  const compacted = await waitQuiescent(4000, 120000);
  console.log(`${stamp()} post-/compact quiescent=${compacted} aliveAfterCompact=${!exited}`);

  // Dump the RAW new lines so we can see exactly what /compact wrote (esp. the
  // mysterious "queue-operation" line and any summary boundary).
  {
    const dumpLines = allLines().slice(linesBefore);
    console.log(`${stamp()} --- RAW new lines after /compact (${dumpLines.length}) ---`);
    for (const { file, raw } of dumpLines.slice(0, 12)) {
      console.log(`${stamp()}   [${file}] ${raw.slice(0, 300)}`);
    }
  }

  // Inspect what /compact wrote: new file? summary/compact marker lines?
  const filesAfter = jsonlFiles().slice();
  const newFiles = filesAfter.filter((f) => !filesBefore.includes(f));
  const lines = allLines();
  const newLines = lines.slice(linesBefore);
  console.log(`${stamp()} files after compact: [${filesAfter.join(', ')}] newFiles=[${newFiles.join(', ')}] newLineCount=${newLines.length}`);

  // Surface any line that looks like a compaction boundary/summary.
  const markerLines = lines.filter(({ obj, raw }) => {
    const t = (obj.type || '').toLowerCase();
    const low = raw.toLowerCase();
    return t.includes('summary') || t.includes('compact') ||
      obj.isCompactSummary === true || obj.isCompact === true ||
      low.includes('iscompactsummary') || low.includes('"compact"') || low.includes('compactmetadata');
  });
  console.log(`${stamp()} compaction-marker lines found: ${markerLines.length}`);
  for (const m of markerLines.slice(0, 4)) {
    const keys = Object.keys(m.obj).join(',');
    console.log(`${stamp()}   marker[file=${m.file} type=${m.obj.type} keys=${keys}] :: ${m.raw.slice(0, 240)}`);
  }
  // Also show the distinct top-level "type" values among the new lines.
  const newTypes = {};
  for (const { obj } of newLines) { const t = obj.type || '(none)'; newTypes[t] = (newTypes[t] || 0) + 1; }
  console.log(`${stamp()} new-line type histogram: ${JSON.stringify(newTypes)}`);

  // ---- One more turn AFTER compact: measure whether context fell ----
  const turnsAfterCompactMarker = assistantTurnCount();
  await injectUntilTurns('In one sentence, what were the two topics we discussed before this?', turnsAfterCompactMarker + 1, 45000);
  await waitQuiescent(2500, 30000);
  const lastAfter = lastAssistantContext();
  const dropped = lastBefore > 0 && lastAfter > 0 && lastAfter < lastBefore;
  const dropPct = lastBefore > 0 ? Math.round((1 - lastAfter / lastBefore) * 100) : 0;

  console.log(`${stamp()} POST-compact next turn: lastContext ${lastBefore} -> ${lastAfter} (drop ${dropPct}%)`);
  console.log(`${stamp()} === RESULT alive=${!exited} contextDropped=${dropped} dropPct=${dropPct}% newTranscript=${newFiles.length > 0} markerLines=${markerLines.length} ===`);
  console.log(`${stamp()} (route B viable if: alive=true AND contextDropped=true; markerLines/newFiles inform how the UI must backfill)`);

  try { p.kill(); } catch {}
  setTimeout(() => { try { fs.rmSync(CWD, { recursive: true, force: true }); } catch {} process.exit(0); }, 500);
})();
