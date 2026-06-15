// v14 probe (STOPREASON): characterize the stop_reason of the turn that carries
// the ```ask block. PRD v14 §1.3 claims it is ALWAYS null (forcing an out-of-band
// unlock in §3.4). verify-askq-options-ext.js observed end_turn instead. Because
// this single fact drives the whole completion-detection design, repeat the
// single-select ask trigger N times and tally the ask-turn stop_reason.
//
// Forensics only -- nothing under src/ is touched.
//
// Usage:  node verify-askq-stopreason.js [N] [cmd|exe]
const pty = require('../node_modules/node-pty');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const N = Number(process.argv[2]) > 0 ? Number(process.argv[2]) : 4;
const FILE_KIND = process.argv[3] === 'exe' ? 'exe' : 'cmd';
const NPM_CMD = 'C:\\Users\\CQDD\\AppData\\Roaming\\npm\\claude.cmd';
const NATIVE = 'C:\\Users\\CQDD\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Anthropic.ClaudeCode_Microsoft.Winget.Source_8wekyb3d8bbwe\\claude.exe';
const FILE = FILE_KIND === 'exe' ? NATIVE : NPM_CMD;

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

const PROTOCOL = [
  'INTERACTIVE OPTIONS PROTOCOL: The AskUserQuestion tool is unavailable.',
  'Whenever you need the user to make a choice, do NOT guess and do NOT proceed.',
  'Instead, output a fenced code block tagged `ask` whose body is ONLY minified JSON:',
  '{"questions":[{"question":"...","header":"short","options":[{"label":"...","description":"..."}],"multiSelect":false}]}',
  'List your recommended option FIRST. Then STOP and end your turn, waiting for the user reply.',
].join(' ');

const ASK_TRIGGER = 'I want you to scaffold a tiny "hello world" CLI tool for me. '
  + 'Before writing ANY code you MUST ask me which programming language to use, '
  + 'because you do not know my preference. Do not assume one.';

const hasAsk = (text) => /```\s*ask\s*\n[\s\S]*?```/i.test(text);

// stop_reason of the FIRST assistant transcript line that carries an ask block.
function askTurnStopReason(cwd) {
  const lines = allLines(cwd);
  for (const o of lines) {
    if (o.type !== 'assistant') continue;
    const c = o?.message?.content; if (!Array.isArray(c)) continue;
    let txt = ''; for (const b of c) if (b.type === 'text') txt += b.text || '';
    if (hasAsk(txt)) return o?.message?.stop_reason ?? null;
  }
  return undefined; // no ask block emitted
}

function spawnClaude(cwd) {
  const env = { ...process.env };
  const args = ['--permission-mode', 'bypassPermissions', '--model', 'claude-opus-4-8', '--disallowedTools', 'AskUserQuestion', '--append-system-prompt', PROTOCOL];
  const st = { buffer: '', trustHandled: false, proc: null };
  st.proc = pty.spawn(FILE, args, { name: 'xterm-256color', cols: 120, rows: 40, cwd, env, useConpty: false });
  st.proc.onData((d) => {
    st.buffer = (st.buffer + d).slice(-20000);
    if (!st.trustHandled) {
      const c = compact(st.buffer);
      if (c.includes('yesitrustthisfolder') && c.includes('noexit')) { st.trustHandled = true; st.proc.write('\r'); }
      else if (c.includes('yesiaccept') && c.includes('noexit')) { st.trustHandled = true; st.proc.write('\x1b[B'); setTimeout(() => st.proc.write('\r'), 200); }
    }
  });
  return st;
}
const screenOf = (st) => stripAnsi(st.buffer).slice(-700);

async function waitForAssistantIdle(cwd, base, timeoutMs) {
  const QUIESCE = 3000; const dl = Date.now() + timeoutMs;
  let lastSize = transcriptSize(cwd), lastChange = Date.now();
  while (Date.now() < dl) {
    await sleep(600);
    const size = transcriptSize(cwd);
    if (size !== lastSize) { lastSize = size; lastChange = Date.now(); }
    const asst = allLines(cwd).filter((o) => o.type === 'assistant').length;
    if (asst > base && Date.now() - lastChange >= QUIESCE) return true;
  }
  return false;
}

async function oneRun(i) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-askqsr-'));
  const st = spawnClaude(cwd);
  { const dl = Date.now() + 30000; while (Date.now() < dl) { if (st.trustHandled && /[>│].*/.test(screenOf(st))) break; await sleep(400); } }
  await sleep(1500);
  const base = allLines(cwd).filter((o) => o.type === 'assistant').length;
  st.proc.write(`\x1b[200~${ASK_TRIGGER}\x1b[201~`);
  await sleep(400);
  st.proc.write('\r');
  await waitForAssistantIdle(cwd, base, 90000);
  await sleep(1000);
  const sr = askTurnStopReason(cwd);
  try { st.proc.kill(); } catch {}
  console.log(`${stamp()} run#${i + 1}: askTurnStopReason=${JSON.stringify(sr)}`);
  return sr;
}

(async () => {
  console.log(`${stamp()} characterizing ask-turn stop_reason over N=${N} runs (claude via ${FILE_KIND})`);
  const tally = {};
  for (let i = 0; i < N; i++) {
    const sr = await oneRun(i);
    const key = sr === undefined ? 'NO_ASK_BLOCK' : String(sr);
    tally[key] = (tally[key] || 0) + 1;
  }
  console.log(`\n${stamp()} ===== TALLY =====`);
  for (const [k, v] of Object.entries(tally)) console.log(`  ${k}: ${v}/${N}`);
  const sawNull = (tally['null'] || 0) > 0;
  console.log(`\n  ask-turn EVER null = ${sawNull}  -> ${sawNull ? 'out-of-band unlock (PRD §3.4) IS needed as safety net' : 'ask-turn ended via end_turn in all runs; B1 may already unlock (re-evaluate §3.4)'}`);
  process.exit(0);
})();
