// Task 2 / Bug A root-cause probe (specs/updatePRDv14.md §9.1):
// Confirm whether editing a file UNDER `.claude/` triggers a confirmation gate
// that `--permission-mode bypassPermissions` does NOT auto-answer, and capture
// the EXACT TUI frame so a fix can answer it deterministically.
//
// Method: spawn the same interactive `claude` the extension does, accept the
// bypass startup warning, then ask it to Edit a throwaway `.claude/` file. Dump
// FULL (untruncated) raw PTY frames with timestamps. A control run edits a
// NORMAL file (outside `.claude/`) for comparison.
//
// Usage:  node scripts/verify-claude-dotclaude-gate.js [dotclaude|normal]
const pty = require('../node_modules/node-pty');
const fs = require('fs');
const path = require('path');

const NPM = process.env.APPDATA ? path.join(process.env.APPDATA, 'npm') : '';
const FILE = path.join(NPM, 'claude.cmd');
const args = ['--permission-mode', 'bypassPermissions', '--model', 'claude-opus-4-8'];

const target = process.argv[2] === 'normal' ? 'normal' : 'dotclaude';

// Prepare the throwaway target file with a known token to replace.
const rel = target === 'dotclaude'
    ? path.join('.claude', 'probe-gate', 'GATE.txt')
    : path.join('probe-gate-normal.txt');
const abs = path.join(process.cwd(), rel);
fs.mkdirSync(path.dirname(abs), { recursive: true });
fs.writeFileSync(abs, 'ORIGINAL\n');

const t0 = Date.now();
const stamp = () => '+' + String(Date.now() - t0).padStart(6, ' ') + 'ms';
const esc = (s) => s.replace(/[\x00-\x1f\x7f]/g, (c) =>
    c === '\x1b' ? '\\e' : c === '\n' ? '\\n' : c === '\r' ? '\\r' : '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`${stamp()} probe target=${target} file=${rel}`);
console.log(`${stamp()} spawn ${FILE}`);
const p = pty.spawn(FILE, args, { name: 'xterm-256color', cols: 120, rows: 40, cwd: process.cwd(), env: process.env, useConpty: false });

// answer=1 -> auto-select option 2 (Down+Enter) when the gate appears, mirroring
// the extension's _handleSelfEditGate, to verify the edit actually goes through.
const answerGate = process.argv[3] === 'answer';
let gateBuffer = '';
let gateAnswered = false;

let lastDataAt = Date.now();
let phase = 'startup';
let toolUseSeen = false;
p.onData((d) => {
    lastDataAt = Date.now();
    // FULL frame (untruncated) so the gate text is captured.
    console.log(`${stamp()} [${phase}] <<${d.length}b>> ${esc(d)}`);

    if (phase !== 'afterPrompt') return;
    gateBuffer = (gateBuffer + d).slice(-16000);
    const compact = gateBuffer.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (compact.includes('allowclaudetoedititsownsettingsforthissession')) {
        toolUseSeen = true;
        if (answerGate && !gateAnswered) {
            gateAnswered = true;
            gateBuffer = '';
            console.log(`${stamp()} === GATE detected; sending Down+Enter (option 2) ===`);
            p.write('\x1b[B');
            setTimeout(() => { try { p.write('\r'); } catch {} }, 200);
        }
    }
});

async function waitQuiet(minQuiet, hardCap) {
    const start = Date.now();
    while (true) {
        await sleep(100);
        if (Date.now() - lastDataAt > minQuiet && Date.now() - start > 600) return;
        if (Date.now() - start > hardCap) return;
    }
}

(async () => {
    await waitQuiet(1000, 8000);
    console.log(`${stamp()} === accept bypass warning (Down+Enter) ===`);
    phase = 'accepting';
    p.write('\x1b[B'); await sleep(250); p.write('\r');
    await waitQuiet(1200, 6000);

    console.log(`${stamp()} === send edit prompt ===`);
    phase = 'afterPrompt';
    const prompt = `Use the Edit tool to replace the word ORIGINAL with CHANGED in the file ${rel}. Make the edit directly, do not ask me for confirmation.`;
    p.write(prompt);
    await sleep(300);
    p.write('\r');

    // Watch a long window (the real hang was 69-98s). If a gate appears we want
    // its frame; if it auto-executes we'll see the tool_result quickly.
    await sleep(45000);
    console.log(`${stamp()} === RESULT: gateMarkersSeen=${toolUseSeen} fileNow=${JSON.stringify(fs.readFileSync(abs, 'utf8'))} ===`);
    try { p.kill(); } catch {}
    setTimeout(() => process.exit(0), 400);
})();
