/**
 * Statistics Worker Script (worker_threads entry)
 *
 * Parses Claude CLI jsonl session files into narrow-field statistics entries.
 * Hot-path design (PRD updatePRDv18 F2.1):
 *  - whole-file read + split('\n') for files < 10MB
 *  - `"usage":{` substring prefilter to skip 90%+ of lines before JSON.parse
 *  - narrow-field extraction: original parsed objects are discarded immediately
 *  - streaming line-by-line fallback for files >= 10MB (memory-spike guard)
 *
 * IMPORTANT: this file runs inside a worker thread — it must only depend on
 * Node.js builtins (no 'vscode' module, no DebugLogger).
 *
 * The file is dual-use: when imported from the main thread (isMainThread=true)
 * it only exports parseJsonlFile() as the crash-fallback parser; the worker
 * message loop below only activates inside an actual worker thread.
 */

import * as fs from 'fs';
import * as readline from 'readline';
import { createReadStream } from 'fs';
import { parentPort, workerData, isMainThread } from 'worker_threads';

/**
 * Narrow-field statistics entry extracted from one jsonl line.
 * Structured-clone friendly: plain data only.
 */
export interface RawStatsEntry {
    timestamp: string;
    usage: {
        input_tokens: number;
        output_tokens: number;
        cache_creation_input_tokens: number;
        cache_read_input_tokens: number;
        // Part of cache_creation_input_tokens written with the 1-hour TTL (billed 2x input)
        cache_creation_1h_input_tokens: number;
    };
    costUSD: number;
    model: string;
    messageId: string;
    requestId: string;
    isSidechain: boolean;
}

/** Per-file parse result posted back to the main thread */
export interface WorkerFileResult {
    file: string;
    entries: RawStatsEntry[];
}

/** Input payload passed via workerData */
export interface StatsWorkerData {
    files: string[];
}

// Streaming fallback threshold: 10MB
const FILE_SIZE_THRESHOLD = 10 * 1024 * 1024;

// Prefilter tokens (Claude CLI jsonl is compact JSON — no spaces after colons)
const USAGE_MARKER = '"usage":{';
const WARMUP_MARKER = '"Warmup"';

/**
 * Line-level filter state shared across a single file scan.
 * Warmup chain filtering: skip auto-generated "Warmup" user messages and any
 * message whose parent is in the warmup chain (parents always precede children
 * in append-only jsonl, so a single in-order pass is sufficient).
 */
function processLine(line: string, warmupUuids: Set<string>, out: RawStatsEntry[]): void {
    // Prefilter: only lines carrying usage data or Warmup markers are relevant
    const hasUsage = line.includes(USAGE_MARKER);
    if (!hasUsage && !line.includes(WARMUP_MARKER)) {
        return;
    }

    let entry: any;
    try {
        entry = JSON.parse(line);
    } catch {
        // Truncated trailing lines are common in live jsonl files — skip silently
        return;
    }

    // Warmup user message itself: record uuid, never count
    if (entry.type === 'user' && entry.message?.content === 'Warmup') {
        if (entry.uuid) {
            warmupUuids.add(entry.uuid);
        }
        return;
    }

    // Response in a warmup chain: extend the chain, never count
    if (entry.parentUuid && warmupUuids.has(entry.parentUuid)) {
        if (entry.uuid) {
            warmupUuids.add(entry.uuid);
        }
        return;
    }

    const usage = entry.message?.usage;
    if (!usage) {
        return;
    }

    // Narrow-field extraction — discard the parsed object right after
    out.push({
        timestamp: entry.timestamp || '',
        usage: {
            input_tokens: usage.input_tokens || 0,
            output_tokens: usage.output_tokens || 0,
            cache_creation_input_tokens: usage.cache_creation_input_tokens || 0,
            cache_read_input_tokens: usage.cache_read_input_tokens || 0,
            cache_creation_1h_input_tokens: usage.cache_creation?.ephemeral_1h_input_tokens || 0
        },
        costUSD: entry.costUSD || 0,
        model: entry.message?.model || '',
        messageId: entry.message?.id || '',
        requestId: entry.requestId || '',
        isSidechain: entry.isSidechain === true
    });
}

/**
 * Parse one jsonl file into narrow-field entries.
 * Also used by the main thread as crash-fallback (import from this module).
 */
export async function parseJsonlFile(filePath: string): Promise<RawStatsEntry[]> {
    const entries: RawStatsEntry[] = [];
    const warmupUuids = new Set<string>();

    const stats = await fs.promises.stat(filePath);

    if (stats.size < FILE_SIZE_THRESHOLD) {
        // Small file: whole-file read is significantly faster than streaming
        const content = await fs.promises.readFile(filePath, 'utf8');
        const lines = content.split('\n');
        for (const line of lines) {
            processLine(line, warmupUuids, entries);
        }
    } else {
        // Large file: stream line-by-line to avoid memory spikes
        await new Promise<void>((resolve, reject) => {
            const rl = readline.createInterface({
                input: createReadStream(filePath, { encoding: 'utf8' }),
                crlfDelay: Infinity
            });
            rl.on('line', (line: string) => {
                processLine(line, warmupUuids, entries);
            });
            rl.on('close', () => resolve());
            rl.on('error', (err: Error) => reject(err));
        });
    }

    return entries;
}

// ---------------------------------------------------------------------------
// Worker thread message loop (inactive when imported from the main thread)
// ---------------------------------------------------------------------------
if (!isMainThread && parentPort) {
    const port = parentPort;
    (async () => {
        const { files } = workerData as StatsWorkerData;
        const results: WorkerFileResult[] = [];
        for (const file of files) {
            try {
                results.push({ file, entries: await parseJsonlFile(file) });
            } catch {
                // Unreadable file: report as empty so the main thread can
                // distinguish "parsed empty" from "worker crashed"
                results.push({ file, entries: [] });
            }
        }
        port.postMessage({ results });
    })().catch((err) => {
        // Fatal batch failure — surface to main thread via worker 'error' event
        throw err;
    });
}
