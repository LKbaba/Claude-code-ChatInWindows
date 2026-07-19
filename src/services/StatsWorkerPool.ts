/**
 * Statistics Worker Pool (main-thread side)
 *
 * Distributes jsonl parsing across worker_threads using LPT (Longest
 * Processing Time first) greedy scheduling by file size (PRD updatePRDv18 F2.2).
 *
 * Pool lifecycle: created per statistics run, workers are spawned once with
 * their pre-assigned batch and destroyed when the run completes.
 *
 * Resilience: a crashed worker does not fail the whole run — its batch falls
 * back to main-thread parsing via parseJsonlFile() (same code path).
 *
 * NOTE: does not import 'vscode' or DebugLogger so it stays loadable from
 * plain Node (benchmark scripts). Logging is injected via an optional callback.
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { Worker } from 'worker_threads';
import { RawStatsEntry, WorkerFileResult, parseJsonlFile } from './statsWorker';

/** Per-file parse result enriched with fs.stat info (consumed by cache layer) */
export interface FileParseResult {
    file: string;
    mtimeMs: number;
    size: number;
    entries: RawStatsEntry[];
}

interface StattedFile {
    file: string;
    mtimeMs: number;
    size: number;
}

export type PoolLogger = (message: string) => void;

export class StatsWorkerPool {
    private readonly _log: PoolLogger;

    constructor(logger?: PoolLogger) {
        this._log = logger ?? (() => { /* no-op */ });
    }

    /**
     * Parse all given jsonl files in parallel across worker threads.
     * Unreadable files (stat failure) are skipped with a log entry.
     */
    public async parseFiles(files: string[]): Promise<FileParseResult[]> {
        if (files.length === 0) {
            return [];
        }

        // Stat all files up front — sizes drive LPT scheduling, mtime/size
        // feed the cache layer
        const statted: StattedFile[] = [];
        await Promise.all(files.map(async (file) => {
            try {
                const s = await fs.promises.stat(file);
                statted.push({ file, mtimeMs: s.mtimeMs, size: s.size });
            } catch (e: any) {
                this._log(`Skipping unreadable file: ${file} (${e?.message || e})`);
            }
        }));

        if (statted.length === 0) {
            return [];
        }

        const statMap = new Map<string, StattedFile>(statted.map(s => [s.file, s]));
        const batches = this._scheduleLpt(statted);

        this._log(`Parsing ${statted.length} files with ${batches.length} workers (LPT)`);

        const batchResults = await Promise.all(
            batches.map((batch) => this._runBatch(batch))
        );

        const results: FileParseResult[] = [];
        for (const workerResults of batchResults) {
            for (const r of workerResults) {
                const stat = statMap.get(r.file);
                results.push({
                    file: r.file,
                    mtimeMs: stat?.mtimeMs ?? 0,
                    size: stat?.size ?? 0,
                    entries: r.entries
                });
            }
        }
        return results;
    }

    /**
     * LPT greedy scheduling: sort files by size descending, assign each to the
     * bucket with the smallest cumulative load.
     */
    private _scheduleLpt(statted: StattedFile[]): string[][] {
        const workerCount = Math.max(1, Math.min(os.cpus().length, 8, statted.length));
        const sorted = [...statted].sort((a, b) => b.size - a.size);

        const buckets: string[][] = Array.from({ length: workerCount }, () => []);
        const loads: number[] = new Array(workerCount).fill(0);

        for (const f of sorted) {
            let minIdx = 0;
            for (let i = 1; i < workerCount; i++) {
                if (loads[i] < loads[minIdx]) {
                    minIdx = i;
                }
            }
            buckets[minIdx].push(f.file);
            loads[minIdx] += f.size;
        }

        return buckets.filter(b => b.length > 0);
    }

    /**
     * Run one batch in a worker thread. On worker crash, fall back to
     * main-thread parsing of the same batch (single worker failure must not
     * break the whole run).
     */
    private async _runBatch(batch: string[]): Promise<WorkerFileResult[]> {
        try {
            return await this._runWorker(batch);
        } catch (e: any) {
            this._log(`Worker crashed (${e?.message || e}), falling back to main-thread parse for ${batch.length} files`);
            const results: WorkerFileResult[] = [];
            for (const file of batch) {
                try {
                    results.push({ file, entries: await parseJsonlFile(file) });
                } catch {
                    results.push({ file, entries: [] });
                }
            }
            return results;
        }
    }

    private _runWorker(batch: string[]): Promise<WorkerFileResult[]> {
        return new Promise<WorkerFileResult[]>((resolve, reject) => {
            // Worker script lives next to this file in the compiled output
            // (out/services/statsWorker.js) — packaged into the VSIX
            const workerScript = path.join(__dirname, 'statsWorker.js');
            const worker = new Worker(workerScript, {
                workerData: { files: batch }
            });

            let settled = false;

            worker.once('message', (msg: { results: WorkerFileResult[] }) => {
                settled = true;
                resolve(msg.results);
                void worker.terminate();
            });

            worker.once('error', (err) => {
                if (!settled) {
                    settled = true;
                    reject(err);
                }
                void worker.terminate();
            });

            worker.once('exit', (code) => {
                if (!settled) {
                    settled = true;
                    reject(new Error(`Worker exited with code ${code} before posting results`));
                }
            });
        });
    }
}
