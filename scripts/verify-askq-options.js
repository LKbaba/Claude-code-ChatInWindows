// v14 probe: validate the "interactive options" core mechanism (Architecture A+).
//
// Hypothesis: the native AskUserQuestion tool is unusable under bypassPermissions
// (it auto-errors "Answer questions?" -- proven by 62 historical transcript
// samples). Instead we DISABLE it via --disallowedTools and instruct Claude (via
// --append-system-prompt) to emit the SAME schema as a fenced ```ask JSON block,
// then stop and wait. The webview will render that block as clickable cards and
// inject the chosen label back as the next message.
//
// This probe drives a real interactive claude in a node-pty and measures the
// RISKIEST assumptions before committing to a PRD:
//   R1: does Claude reliably emit a parseable ```ask block AND end its turn
//       (instead of guessing and barreling ahead)?
//   R2: does --disallowedTools AskUserQuestion stop the native tool / no errors?
//   R3: round-trip -- injecting a chosen label as the next message continues
//       the conversation as if the question was answered.
//
// Usage:  node verify-askq-options.js [cmd|exe]
const pty = require('../node_modules/node-pty');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const NPM_CMD = 'C:\\Users\\CQDD\\AppData\\Roaming\\npm\\claude.cmd';
const NATIVE = 'C:\\Users\\CQDD\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Anthropic.ClaudeCode_Microsoft.Winget.Source_8wekyb3d8bbwe\\claude.exe';
const FILE = process.argv[2] === 'exe' ? NATIVE : NPM_CMD;

const t0 = Date.now();
const stamp = () => '+' + String(Date.now() - t0).padStart(6, ' ') + 'ms';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
const compact = (s) => stripAnsi(s).toLowerCase().replace(/[^a-z0-9]/g, '');

function projectDir(cwd) { return path.join(os.homedir(), '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-')); }
function transcriptSize(cwd) {
  const dir = projectDir(cwd); let total = 0;
  try { for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.jsonl'))) { try { total += fs.statSync(path.join(dir, f)).size; } catch {} } } catch {}
  return total;
}
function allLines(cwd) {
  const dir = projectDir(cwd); const out = [];
  try { for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.jsonl'))) {
    let txt = ''; try { txt = fs.readFileSync(path.join(dir, f), 'utf8'); } catch { continue; }
    for (const line of txt.split('\n')) { if (line.trim()) { try { out.push(JSON.parse(line)); } catch {} } }
  } } catch {}
  return out;
}

// The convention we would ship in --append-system-prompt. Borrow AskUserQuestion's
// exact schema so the model (which knows it intimately) emits well-formed JSON.
const PROTOCOL = [
  'INTERACTIVE OPTIONS PROTOCOL: The AskUserQuestion tool is unavailable.',
  'Whenever you need the user to make a choice, do NOT guess and do NOT proceed.',
  'Instead, output a fenced code block tagged `ask` whose body is ONLY minified JSON:',
  '{"questions":[{"question":"...","header":"short","options":[{"label":"...","description":"..."}],"multiSelect":false}]}',
  'List your recommended option FIRST. Then STOP and end your turn, waiting for the user reply.',
].join(' ');

// A request that cannot be answered without a choice -> forces a clarifying ask.
const ASK_TRIGGER = 'I want you to scaffold a tiny "hello world" CLI tool for me. '
  + 'Before writing ANY code you MUST ask me which programming language to use, '
  + 'because you do not know my preference. Do not assume one.';

const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-askq-'));
let buffer = '';
let trustHandled = false;
let ptyProc = null;

function spawnClaude() {
  const env = { ...process.env };
  const args = [
    '--permission-mode', 'bypassPermissions',
    '--model', 'claude-opus-4-8',
    '--disallowedTools', 'AskUserQuestion',
    '--append-system-prompt', PROTOCOL,
  ];
  ptyProc = pty.spawn(FILE, args, { name: 'xterm-256color', cols: 120, rows: 40, cwd, env, useConpty: false });
  ptyProc.onData((d) => {
    buffer = (buffer + d).slice(-20000);
    if (!trustHandled) {
      const c = compact(buffer);
      if (c.includes('yesitrustthisfolder') && c.includes('noexit')) { trustHandled = true; ptyProc.write('\r'); }
      else if (c.includes('yesiaccept') && c.includes('noexit')) { trustHandled = true; ptyProc.write('\x1b[B'); setTimeout(() => ptyProc.write('\r'), 200); }
    }
  });
}
const bpaste = (text) => ptyProc.write(`\x1b[200~${text}\x1b[201~`);
const screen = () => stripAnsi(buffer).slice(-700);

// Wait until an assistant message with stop_reason==='end_turn' appears AFTER
// `sinceCount` existing assistant messages (so we catch the NEW turn ending).
async function waitForTurnEnd(sinceAssistantCount, timeoutMs) {
  const dl = Date.now() + timeoutMs;
  while (Date.now() < dl) {
    const lines = allLines(cwd);
    const asst = lines.filter((o) => o.type === 'assistant');
    if (asst.length > sinceAssistantCount) {
      const ended = asst.some((o) => o?.message?.stop_reason === 'end_turn');
      if (ended) return true;
    }
    await sleep(500);
  }
  return false;
}

// Pull the LAST assistant text blob from the transcript.
function lastAssistantText() {
  const lines = allLines(cwd);
  let txt = '';
  for (const o of lines) {
    if (o.type !== 'assistant') continue;
    const c = o?.message?.content; if (!Array.isArray(c)) continue;
    let cur = '';
    for (const b of c) { if (b.type === 'text') cur += b.text || ''; }
    if (cur.trim()) txt = cur; // last non-empty wins
  }
  return txt;
}

// Did Claude prematurely act (write code / call a tool) instead of just asking?
function calledActionTools() {
  const lines = allLines(cwd);
  for (const o of lines) {
    if (o.type !== 'assistant') continue;
    const c = o?.message?.content; if (!Array.isArray(c)) continue;
    for (const b of c) {
      if (b.type === 'tool_use' && /write|edit|bash|notebookedit/i.test(b.name || '')) return b.name;
    }
  }
  return null;
}

function parseAskBlock(text) {
  // Match a fenced block tagged `ask` (tolerant of casing / extra spaces).
  const m = text.match(/```\s*ask\s*\n([\s\S]*?)```/i);
  if (!m) return { found: false };
  let json = null, valid = false, schemaOk = false, firstLabel = null;
  try {
    json = JSON.parse(m[1].trim());
    valid = true;
    const q = json?.questions?.[0];
    const opts = q?.options;
    if (q && q.question && Array.isArray(opts) && opts.length >= 1 && opts[0].label) {
      schemaOk = true; firstLabel = opts[0].label;
    }
  } catch {}
  return { found: true, valid, schemaOk, firstLabel, raw: m[1].trim().slice(0, 300) };
}

(async () => {
  console.log(`${stamp()} spawn claude (disallow AskUserQuestion + protocol) cwd=${cwd}`);
  spawnClaude();

  // wait for prompt ready
  { const dl = Date.now() + 30000; while (Date.now() < dl) { if (trustHandled && /[>│].*/.test(screen())) break; await sleep(400); } }
  await sleep(1500);

  // ---- TURN 1: send the ambiguous request, expect an ```ask block + end_turn ----
  const baseAsst = allLines(cwd).filter((o) => o.type === 'assistant').length;
  console.log(`${stamp()} inject ASK_TRIGGER...`);
  bpaste(ASK_TRIGGER);
  await sleep(400);
  ptyProc.write('\r');

  const ended1 = await waitForTurnEnd(baseAsst, 90000);
  await sleep(1500);

  const text1 = lastAssistantText();
  const ask = parseAskBlock(text1);
  const premature = calledActionTools();

  console.log(`${stamp()} --- TURN 1 assistant text (tail) ---`);
  console.log(text1.slice(-500).split('\n').map((l) => '      | ' + l).join('\n'));
  console.log(`${stamp()} BLOCK_FOUND=${ask.found} JSON_VALID=${ask.valid} SCHEMA_OK=${ask.schemaOk} firstLabel=${JSON.stringify(ask.firstLabel)}`);
  if (ask.found) console.log(`${stamp()} ask.raw=${ask.raw}`);

  let roundtripOk = false;
  if (ask.schemaOk && ask.firstLabel) {
    // ---- TURN 2: simulate a click -> inject the chosen label as next message ----
    const base2 = allLines(cwd).filter((o) => o.type === 'assistant').length;
    console.log(`${stamp()} simulate click -> inject chosen label: ${JSON.stringify(ask.firstLabel)}`);
    bpaste(ask.firstLabel);
    await sleep(400);
    ptyProc.write('\r');
    const ended2 = await waitForTurnEnd(base2, 90000);
    await sleep(1500);
    const text2 = lastAssistantText();
    // Heuristic: Claude acknowledges the choice OR now takes action with that language.
    const lang = String(ask.firstLabel).toLowerCase();
    roundtripOk = ended2 && (calledActionTools() !== null || text2.toLowerCase().includes(lang.split(/[^a-z]/)[0] || lang));
    console.log(`${stamp()} --- TURN 2 assistant text (tail) ---`);
    console.log(text2.slice(-400).split('\n').map((l) => '      | ' + l).join('\n'));
  }

  // Confirm the native tool was NOT used and no "Answer questions?" error.
  const lines = allLines(cwd);
  let nativeAskUsed = false, answerErr = false;
  for (const o of lines) {
    const c = o?.message?.content; if (!Array.isArray(c)) continue;
    for (const b of c) {
      if (b.type === 'tool_use' && b.name === 'AskUserQuestion') nativeAskUsed = true;
      if (b.type === 'tool_result') { const t = typeof b.content === 'string' ? b.content : JSON.stringify(b.content); if (/answer questions\?/i.test(t)) answerErr = true; }
    }
  }

  try { ptyProc.kill(); } catch {}
  console.log(`${stamp()} ===== RESULT =====`);
  console.log(`${stamp()}   R1 ended_turn      = ${ended1}`);
  console.log(`${stamp()}   R1 block parseable = ${ask.found && ask.valid && ask.schemaOk}`);
  console.log(`${stamp()}   R1 no premature act= ${premature === null}  ${premature ? '(LEAKED: ' + premature + ')' : ''}`);
  console.log(`${stamp()}   R2 native tool off = ${!nativeAskUsed && !answerErr}  (nativeUsed=${nativeAskUsed} answerErr=${answerErr})`);
  console.log(`${stamp()}   R3 roundtrip ok    = ${roundtripOk}`);
  const PASS = ended1 && ask.schemaOk && premature === null && !nativeAskUsed && roundtripOk;
  console.log(`${stamp()}   OVERALL PASS       = ${PASS}`);
  process.exit(0);
})();
