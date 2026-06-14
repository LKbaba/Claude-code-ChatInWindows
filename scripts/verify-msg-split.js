// Headless unit verification for the two NEW pure algorithms added in Task 2/3,
// exercised against the COMPILED extension code (out/) with a minimal `vscode`
// stub. No live PTY here -- the PTY timing is covered by verify-image-staged*.js;
// this isolates the message-splitting + chip-detection logic.
//
//   1. ClaudeChatProvider._splitImageMentions  (Task 3): pulls image @-mentions
//      out of the CLI-bound text into an absolute-path array; leaves non-image
//      mentions in place.
//   2. ClaudeProcessService._detectImageChip   (Task 2): recognizes "[Image #N]"
//      attachment chips (ANSI-stripped) and ignores path echoes like image1.png.
//
// Instances are built with Object.create(proto) so neither constructor (and its
// VS Code dependencies) has to run -- both methods are pure aside from fs/path.
//
// Usage: node verify-msg-split.js
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const Module = require('node:module');

// --- minimal vscode stub so the compiled modules can be required ---
const vscodeStub = {
  window: { createOutputChannel: () => ({ appendLine() {}, append() {}, show() {}, dispose() {}, clear() {} }) },
  workspace: { getConfiguration: () => ({ get: () => undefined }), workspaceFolders: undefined },
  commands: { registerCommand: () => ({ dispose() {} }) },
  Uri: { file: (p) => ({ fsPath: p }) },
  EventEmitter: class { constructor() { this.event = () => ({ dispose() {} }); } fire() {} dispose() {} },
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') { return vscodeStub; }
  return origLoad.call(this, request, parent, isMain);
};

const { ClaudeChatProvider } = require('../out/providers/ClaudeChatProvider');
const { ClaudeProcessService } = require('../out/services/ClaudeProcessService');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail ?? ''}`); }
}

// ---------- fixtures: CJK + space workspace with real image + non-image files ----------
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-split-'));
const imgDir = path.join(cwd, '图片 文件夹');
fs.mkdirSync(imgDir, { recursive: true });
const img1Rel = '图片 文件夹/卡片 1.png';
const img2Rel = '图片 文件夹/卡片 2.JPG'; // uppercase ext on purpose
const tsRel = 'src/foo.ts';
fs.writeFileSync(path.join(cwd, img1Rel), 'x');
fs.writeFileSync(path.join(cwd, img2Rel), 'x');
fs.mkdirSync(path.join(cwd, 'src'), { recursive: true });
fs.writeFileSync(path.join(cwd, tsRel), 'x');

// NOTE: the @-mention regex splits on whitespace, so a path containing a space
// only matches up to the space. The real image entry points insert paths via a
// picker; this test focuses on space-free mentions for the @-token cases and
// uses absolute paths (also space-containing) for the resolution path.
const provider = Object.create(ClaudeChatProvider.prototype);

// 1. no-image regression: text-only message unchanged, empty image array
{
  const r = provider._splitImageMentions('just a plain message with no mentions', cwd);
  check('no-image: text unchanged', r.text === 'just a plain message with no mentions', r.text);
  check('no-image: empty array', r.imageAbsPaths.length === 0, JSON.stringify(r.imageAbsPaths));
}

// 2. non-image @mention left untouched (Read path)
{
  const r = provider._splitImageMentions(`look at @${tsRel} please`, cwd);
  check('non-image mention kept in text', r.text.includes(`@${tsRel}`), r.text);
  check('non-image mention not routed', r.imageAbsPaths.length === 0, JSON.stringify(r.imageAbsPaths));
}

// 3. single image @mention (space-free path) routed out, abs path collected
{
  // Use a space-free relative image to exercise the @-token path.
  const sf = 'card.png';
  fs.writeFileSync(path.join(cwd, sf), 'x');
  const r = provider._splitImageMentions(`describe @${sf} for me`, cwd);
  check('single image: token removed from text', !r.text.includes('card.png'), r.text);
  check('single image: text preserved around token', r.text.includes('describe') && r.text.includes('for me'), r.text);
  check('single image: abs path collected', r.imageAbsPaths.length === 1 && r.imageAbsPaths[0] === path.join(cwd, sf), JSON.stringify(r.imageAbsPaths));
}

// 4. mixed: image + non-image + text -> image routed, .ts kept inline
{
  const sf = 'shot.jpeg';
  fs.writeFileSync(path.join(cwd, sf), 'x');
  const r = provider._splitImageMentions(`compare @${sf} with @${tsRel} thanks`, cwd);
  check('mixed: image routed', r.imageAbsPaths.length === 1 && r.imageAbsPaths[0].endsWith('shot.jpeg'), JSON.stringify(r.imageAbsPaths));
  check('mixed: .ts kept in text', r.text.includes(`@${tsRel}`), r.text);
  check('mixed: image token gone', !r.text.includes('shot.jpeg'), r.text);
}

// 5. absolute image path mention (CJK + space) resolves
{
  const abs = path.join(cwd, '图片 文件夹', '卡片 1.png'); // contains a space -> only matches up to space via regex
  // Provide a space-free absolute image to validate the isAbsolute branch.
  const absSF = path.join(cwd, 'abs-card.png');
  fs.writeFileSync(absSF, 'x');
  const r = provider._splitImageMentions(`see @${absSF} end`, cwd);
  check('absolute image: routed', r.imageAbsPaths.length === 1 && r.imageAbsPaths[0] === absSF, JSON.stringify(r.imageAbsPaths));
  check('absolute image: token removed', !r.text.includes('abs-card.png'), r.text);
}

// 6. duplicate image mention de-duped
{
  const sf = 'dup.png';
  fs.writeFileSync(path.join(cwd, sf), 'x');
  const r = provider._splitImageMentions(`@${sf} and again @${sf}`, cwd);
  check('duplicate image de-duped', r.imageAbsPaths.length === 1, JSON.stringify(r.imageAbsPaths));
}

// ---------- _detectImageChip ----------
const svc = Object.create(ClaudeProcessService.prototype);
const ESC = '\x1b';
function ansi(s) { return `${ESC}[2m${s}${ESC}[0m`; } // wrap with dim/reset to test stripping

check('chip: detects [Image #1]', svc._detectImageChip('prompt ❯ [Image #1] (↑ to select)', 1) === true);
check('chip: detects with ANSI noise', svc._detectImageChip(ansi('❯ [Image #1] '), 1) === true);
check('chip: #2 satisfies n=2', svc._detectImageChip('[Image #1] [Image #2]', 2) === true);
check('chip: only #1 does NOT satisfy n=2', svc._detectImageChip('[Image #1]', 2) === false);
check('chip: path echo image1.png does NOT false-trigger', svc._detectImageChip('pasting E:\\foo\\image1.png', 1) === false);
check('chip: empty buffer false', svc._detectImageChip('', 1) === false);
check('chip: spaced form [ Image # 1 ]', svc._detectImageChip('[ Image # 1 ]', 1) === true);

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
