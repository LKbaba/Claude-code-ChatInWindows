// v14 probe (EXT): harden the "interactive options" mechanism before implementing.
//
// verify-askq-options.js already proved the SINGLE-SELECT happy path (block emitted,
// no premature action, native tool off, click round-trip) AND discovered that the
// turn carrying the ```ask block has transcript stop_reason === null. This sibling
// probe covers the remaining variables that Task 2/3 need pinned down:
//
//   S1 multiSelect : model emits multiSelect:true with >=3 options; injecting a
//                    natural multi-label sentence continues the conversation.
//   S2 multiQuestion: model emits questions.length >= 2, each with valid options.
//   S3 control     : NO protocol (only --disallowedTools) -> observe the model's
//                    NATURAL plain-text clarifying output, so Task 3 can design the
//                    "parse fails -> render as plain text" degradation sensibly.
//   RE re-confirm  : (a) the ask-block turn's stop_reason === null (printed from the
//                    actual transcript message), and (b) with --disallowedTools
//                    AskUserQuestion there is NO name==="AskUserQuestion" tool_use and
//                    NO "Answer questions?" error anywhere (tool truly removed).
//
// Only validation/forensics here -- NOTHING under src/ is touched.
//
// Usage:  node verify-askq-options-ext.js [cmd|exe]
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

// Same convention we will ship in --append-system-prompt (proven by the base probe).
const PROTOCOL = [
  'INTERACTIVE OPTIONS PROTOCOL: The AskUserQuestion tool is unavailable.',
  'Whenever you need the user to make a choice, do NOT guess and do NOT proceed.',
  'Instead, output a fenced code block tagged `ask` whose body is ONLY minified JSON:',
  '{"questions":[{"question":"...","header":"short","options":[{"label":"...","description":"..."}],"multiSelect":false}]}',
  'Set multiSelect:true when several options may be chosen together. You may include',
  'multiple entries in "questions" when you need to ask about more than one thing.',
  'List your recommended option FIRST. Then STOP and end your turn, waiting for the user reply.',
].join(' ');

// Triggers crafted to force each shape.
const MS_TRIGGER = 'I want you to scaffold a new TypeScript web project. Before writing ANY code you '
  + 'MUST ask me which optional dev features to enable. I may want SEVERAL of them, so let me pick '
  + 'multiple at once. Offer at least these: ESLint, Prettier, Vitest, GitHub Actions CI, Husky. '
  + 'Do not assume; ask first and allow multiple selection.';

const MQ_TRIGGER = 'I want you to scaffold a new CLI tool. Before writing ANY code you MUST ask me TWO '
  + 'separate questions AT THE SAME TIME: (1) which programming language to use, and (2) which '
  + 'open-source license to apply. Ask both questions together in one turn, then stop. Do not assume either.';

const CTRL_TRIGGER = 'I want you to scaffold a tiny "hello world" CLI tool for me. Before writing ANY '
  + 'code you MUST ask me which programming language to use, because you do not know my preference. '
  + 'Do not assume one.';

function parseAskBlock(text) {
  const m = text.match(/```\s*ask\s*\n([\s\S]*?)```/i);
  if (!m) return { found: false };
  let json = null, valid = false, schemaOk = false;
  try {
    json = JSON.parse(m[1].trim());
    valid = true;
    const qs = json?.questions;
    if (Array.isArray(qs) && qs.length >= 1) {
      schemaOk = qs.every((q) => q && q.question && Array.isArray(q.options) && q.options.length >= 1 && q.options[0].label);
    }
  } catch {}
  const q0 = json?.questions?.[0];
  return {
    found: true, valid, schemaOk, json,
    questionsLength: Array.isArray(json?.questions) ? json.questions.length : 0,
    multiSelect: !!q0?.multiSelect,
    optionCount: Array.isArray(q0?.options) ? q0.options.length : 0,
    firstLabel: q0?.options?.[0]?.label ?? null,
    allFirstLabels: Array.isArray(q0?.options) ? q0.options.map((o) => o.label) : [],
  };
}

// Last assistant text blob.
function lastAssistantText(cwd) {
  const lines = allLines(cwd); let txt = '';
  for (const o of lines) {
    if (o.type !== 'assistant') continue;
    const c = o?.message?.content; if (!Array.isArray(c)) continue;
    let cur = ''; for (const b of c) if (b.type === 'text') cur += b.text || '';
    if (cur.trim()) txt = cur;
  }
  return txt;
}

// Find the assistant message whose text carries an ask block, return its stop_reason.
function askBlockStopReason(cwd) {
  const lines = allLines(cwd);
  for (let i = lines.length - 1; i >= 0; i--) {
    const o = lines[i];
    if (o.type !== 'assistant') continue;
    const c = o?.message?.content; if (!Array.isArray(c)) continue;
    let txt = ''; for (const b of c) if (b.type === 'text') txt += b.text || '';
    if (parseAskBlock(txt).found) return { stopReason: o?.message?.stop_reason ?? null };
  }
  return null;
}

function calledActionTools(cwd) {
  const lines = allLines(cwd);
  for (const o of lines) {
    if (o.type !== 'assistant') continue;
    const c = o?.message?.content; if (!Array.isArray(c)) continue;
    for (const b of c) if (b.type === 'tool_use' && /write|edit|bash|notebookedit/i.test(b.name || '')) return b.name;
  }
  return null;
}

// Scan for native AskUserQuestion usage / "Answer questions?" auto-error.
function nativeToolEvidence(cwd) {
  const lines = allLines(cwd); let used = false, answerErr = false;
  for (const o of lines) {
    const c = o?.message?.content; if (!Array.isArray(c)) continue;
    for (const b of c) {
      if (b.type === 'tool_use' && b.name === 'AskUserQuestion') used = true;
      if (b.type === 'tool_result') { const t = typeof b.content === 'string' ? b.content : JSON.stringify(b.content); if (/answer questions\?/i.test(t)) answerErr = true; }
    }
  }
  return { used, answerErr };
}

// Spawn a fresh interactive claude in its own cwd, handling the trust/accept gate.
function spawnClaude(cwd, withProtocol) {
  const env = { ...process.env };
  const args = [
    '--permission-mode', 'bypassPermissions',
    '--model', 'claude-opus-4-8',
    '--disallowedTools', 'AskUserQuestion',
  ];
  if (withProtocol) args.push('--append-system-prompt', PROTOCOL);
  const state = { buffer: '', trustHandled: false, proc: null };
  state.proc = pty.spawn(FILE, args, { name: 'xterm-256color', cols: 120, rows: 40, cwd, env, useConpty: false });
  state.proc.onData((d) => {
    state.buffer = (state.buffer + d).slice(-20000);
    if (!state.trustHandled) {
      const c = compact(state.buffer);
      if (c.includes('yesitrustthisfolder') && c.includes('noexit')) { state.trustHandled = true; state.proc.write('\r'); }
      else if (c.includes('yesiaccept') && c.includes('noexit')) { state.trustHandled = true; state.proc.write('\x1b[B'); setTimeout(() => state.proc.write('\r'), 200); }
    }
  });
  return state;
}
const screenOf = (st) => stripAnsi(st.buffer).slice(-700);
const bpaste = (st, text) => st.proc.write(`\x1b[200~${text}\x1b[201~`);

// Wait until a NEW assistant message appeared AND the transcript went quiet for
// QUIESCE ms. This catches the ask-block turn WITHOUT relying on end_turn (which it
// never reaches -- stop_reason === null is exactly the gap we are re-confirming).
async function waitForAssistantIdle(cwd, baseAsstCount, timeoutMs) {
  const QUIESCE = 3000;
  const dl = Date.now() + timeoutMs;
  let lastSize = transcriptSize(cwd), lastChange = Date.now();
  while (Date.now() < dl) {
    await sleep(600);
    const size = transcriptSize(cwd);
    if (size !== lastSize) { lastSize = size; lastChange = Date.now(); }
    const asst = allLines(cwd).filter((o) => o.type === 'assistant').length;
    if (asst > baseAsstCount && Date.now() - lastChange >= QUIESCE) return true;
  }
  return false;
}

async function waitReady(st) {
  const dl = Date.now() + 30000;
  while (Date.now() < dl) { if (st.trustHandled && /[>│].*/.test(screenOf(st))) break; await sleep(400); }
  await sleep(1500);
}

async function runScenario(name, trigger, withProtocol) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-askqx-'));
  console.log(`\n${stamp()} [${name}] spawn (protocol=${withProtocol}) cwd=${cwd}`);
  const st = spawnClaude(cwd, withProtocol);
  await waitReady(st);

  const base = allLines(cwd).filter((o) => o.type === 'assistant').length;
  console.log(`${stamp()} [${name}] inject trigger...`);
  bpaste(st, trigger);
  await sleep(400);
  st.proc.write('\r');

  await waitForAssistantIdle(cwd, base, 90000);
  await sleep(1200);

  const text = lastAssistantText(cwd);
  const ask = parseAskBlock(text);
  const premature = calledActionTools(cwd);
  const stopInfo = askBlockStopReason(cwd);

  console.log(`${stamp()} [${name}] --- assistant text (tail) ---`);
  console.log(text.slice(-600).split('\n').map((l) => '      | ' + l).join('\n'));
  console.log(`${stamp()} [${name}] found=${ask.found} valid=${ask.valid} schemaOk=${ask.schemaOk} `
    + `questions=${ask.questionsLength} multiSelect=${ask.multiSelect} options0=${ask.optionCount} `
    + `stop_reason=${JSON.stringify(stopInfo?.stopReason)}`);

  return { name, cwd, st, ask, premature, text, stopReason: stopInfo ? stopInfo.stopReason : undefined };
}

// Inject a natural multi-label sentence as the "click" of a multiSelect card.
async function multiSelectRoundtrip(r) {
  const labels = (r.ask.allFirstLabels || []).slice(0, 3).filter(Boolean);
  if (labels.length < 2) return false;
  const sentence = `Please enable these: ${labels.join(', ')}.`;
  const base2 = allLines(r.cwd).filter((o) => o.type === 'assistant').length;
  console.log(`${stamp()} [${r.name}] click(multi) -> inject: ${JSON.stringify(sentence)}`);
  bpaste(r.st, sentence);
  await sleep(400);
  r.st.proc.write('\r');
  // After the click, a real answer turn normally reaches end_turn.
  const dl = Date.now() + 90000;
  let ok = false;
  while (Date.now() < dl) {
    const asst = allLines(r.cwd).filter((o) => o.type === 'assistant');
    if (asst.length > base2 && asst.some((o) => o?.message?.stop_reason === 'end_turn')) { ok = true; break; }
    await sleep(600);
  }
  await sleep(1000);
  const t2 = lastAssistantText(r.cwd).toLowerCase();
  const acted = calledActionTools(r.cwd) !== null;
  const mentions = labels.some((l) => t2.includes(String(l).toLowerCase().split(/[^a-z]/)[0]));
  console.log(`${stamp()} [${r.name}] roundtrip ended=${ok} acted=${acted} mentions=${mentions}`);
  return ok && (acted || mentions);
}

(async () => {
  const results = {};

  // ---- S1 multiSelect ----
  const ms = await runScenario('S1-multiSelect', MS_TRIGGER, true);
  const msRoundtrip = ms.ask.schemaOk && ms.ask.multiSelect ? await multiSelectRoundtrip(ms) : false;
  results.S1 = {
    schemaOk: ms.ask.schemaOk, multiSelect: ms.ask.multiSelect, options: ms.ask.optionCount,
    roundtrip: msRoundtrip, stopReason: ms.stopReason,
  };
  try { ms.st.proc.kill(); } catch {}

  // ---- S2 multiQuestion ----
  const mq = await runScenario('S2-multiQuestion', MQ_TRIGGER, true);
  const mqEachOk = mq.ask.schemaOk && mq.ask.questionsLength >= 2;
  results.S2 = { schemaOk: mq.ask.schemaOk, questions: mq.ask.questionsLength, eachValid: mqEachOk, stopReason: mq.stopReason };
  try { mq.st.proc.kill(); } catch {}

  // ---- S3 control (no protocol): record the NATURAL clarifying output ----
  const ctrl = await runScenario('S3-control', CTRL_TRIGGER, false);
  const ctrlNoBlock = !ctrl.ask.found;             // expect plain text, not a fenced ask block
  results.S3 = {
    emittedAskBlock: ctrl.ask.found, plainTextClarify: ctrlNoBlock,
    naturalSample: ctrl.text.replace(/\s+/g, ' ').trim().slice(0, 240),
  };
  try { ctrl.st.proc.kill(); } catch {}

  // ---- RE re-confirm: native tool off across all three runs + ask-turn stop_reason ----
  const evAll = [ms.cwd, mq.cwd, ctrl.cwd].map(nativeToolEvidence);
  const nativeUsed = evAll.some((e) => e.used);
  const answerErr = evAll.some((e) => e.answerErr);
  const askStopNull = ms.stopReason === null || mq.stopReason === null; // at least one ask turn is null

  // ---- summary ----
  console.log(`\n${stamp()} ================= SUMMARY =================`);
  console.log(`  S1 multiSelect : schemaOk=${results.S1.schemaOk} multiSelect=${results.S1.multiSelect} `
    + `options=${results.S1.options} roundtrip=${results.S1.roundtrip}`);
  console.log(`  S2 multiQuestion: schemaOk=${results.S2.schemaOk} questions=${results.S2.questions} eachValid=${results.S2.eachValid}`);
  console.log(`  S3 control      : emittedBlock=${results.S3.emittedAskBlock} plainTextClarify=${results.S3.plainTextClarify}`);
  console.log(`     S3 natural sample: ${results.S3.naturalSample}`);
  console.log(`  RE stop_reason  : S1=${JSON.stringify(results.S1.stopReason)} S2=${JSON.stringify(results.S2.stopReason)} (askTurnNull=${askStopNull})`);
  console.log(`  RE native off   : nativeUsed=${nativeUsed} answerErr=${answerErr} (ok=${!nativeUsed && !answerErr})`);

  const PASS_S1 = results.S1.schemaOk && results.S1.multiSelect && results.S1.options >= 3 && results.S1.roundtrip;
  const PASS_S2 = results.S2.eachValid && results.S2.questions >= 2;
  const PASS_S3 = results.S3.plainTextClarify;            // natural degradation observed/recorded
  const PASS_RE = askStopNull && !nativeUsed && !answerErr;
  const FAIL = !(PASS_S1 && PASS_S2 && PASS_S3 && PASS_RE);
  console.log(`\n  PASS_S1=${PASS_S1} PASS_S2=${PASS_S2} PASS_S3=${PASS_S3} PASS_RE=${PASS_RE}`);
  console.log(`  OVERALL ${FAIL ? 'FAIL' : 'PASS'}`);
  process.exit(FAIL ? 1 : 0);
})();
