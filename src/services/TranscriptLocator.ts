/**
 * Transcript Locator
 *
 * Pure helpers to locate Claude CLI transcript JSONL files.
 *
 * Claude CLI writes every session's structured record to:
 *   ~/.claude/projects/{slug}/{sessionId}.jsonl
 *
 * Slug encoding rule (empirically verified against the real on-disk directory,
 * NOT the simplified description in the PLAN): every character of the project's
 * absolute path that is not [a-zA-Z0-9] is replaced by '-'. Consecutive
 * separators are NOT collapsed and case is preserved.
 *
 *   Windows: 'e:\\Github\\Claude-code-ChatInWindows'
 *            -> 'e--Github-Claude-code-ChatInWindows'   ( ':' and '\' both -> '-' )
 *   POSIX:   '/Users/me/proj'
 *            -> '-Users-me-proj'                         ( leading '/' -> '-' )
 *
 * These functions only read the filesystem; they never write and never throw on
 * a missing directory (they degrade to an empty set / undefined).
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Encode a project working directory into the Claude `projects/` slug.
 * Rule: replace every non-alphanumeric character with '-' (no collapsing, case kept).
 */
export function encodeProjectSlug(cwd: string): string {
    return cwd.replace(/[^a-zA-Z0-9]/g, '-');
}

/**
 * Absolute path of the per-project transcript directory under the user's home.
 */
export function getProjectDir(cwd: string): string {
    return path.join(os.homedir(), '.claude', 'projects', encodeProjectSlug(cwd));
}

/**
 * Absolute path of a specific session's transcript file.
 */
export function resolveSessionFile(cwd: string, sessionId: string): string {
    return path.join(getProjectDir(cwd), `${sessionId}.jsonl`);
}

/**
 * Find the most-recently-modified `*.jsonl` in the project's transcript dir.
 * @param since Optional epoch-ms threshold; only files modified at/after it are
 *              considered (used to discover the session created after launch).
 * @returns Absolute path of the newest matching file, or undefined if none.
 */
export function findLatestSessionFile(cwd: string, since?: number): string | undefined {
    const dir = getProjectDir(cwd);
    let entries: string[];
    try {
        entries = fs.readdirSync(dir);
    } catch {
        // Directory does not exist yet (no session ever started here).
        return undefined;
    }

    let latestPath: string | undefined;
    let latestMtime = -Infinity;

    for (const name of entries) {
        if (!name.endsWith('.jsonl')) {
            continue;
        }
        const full = path.join(dir, name);
        let stat: fs.Stats;
        try {
            stat = fs.statSync(full);
        } catch {
            continue;
        }
        if (!stat.isFile()) {
            continue;
        }
        if (since !== undefined && stat.mtimeMs < since) {
            continue;
        }
        if (stat.mtimeMs > latestMtime) {
            latestMtime = stat.mtimeMs;
            latestPath = full;
        }
    }

    return latestPath;
}

/**
 * Snapshot the set of `*.jsonl` file names currently present in the project dir.
 * Take this BEFORE launching a session, then diff against a later read to
 * discover the newly-created session file. Returns an empty set if the dir is
 * missing.
 */
export function snapshotSessionFiles(cwd: string): Set<string> {
    const dir = getProjectDir(cwd);
    try {
        return new Set(fs.readdirSync(dir).filter(n => n.endsWith('.jsonl')));
    } catch {
        return new Set<string>();
    }
}

// ---------------------------------------------------------------------------
// Lightweight self-test for the encoding rule. Runs only when this file is
// executed directly (`node out/services/TranscriptLocator.js`), never on import.
// ---------------------------------------------------------------------------
if (require.main === module) {
    const assertEq = (actual: string, expected: string) => {
        if (actual !== expected) {
            throw new Error(`encodeProjectSlug mismatch: got "${actual}", expected "${expected}"`);
        }
    };
    assertEq(encodeProjectSlug('e:\\Github\\Claude-code-ChatInWindows'), 'e--Github-Claude-code-ChatInWindows');
    assertEq(encodeProjectSlug('/Users/me/proj'), '-Users-me-proj');
    assertEq(encodeProjectSlug('C:\\a.b\\c'), 'C--a-b-c'); // dots also become '-'
    // eslint-disable-next-line no-console
    console.log('TranscriptLocator self-test passed');
}
