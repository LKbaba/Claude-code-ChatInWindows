import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { RawStatsEntry } from './statsWorker';

// Statistics entry type (aggregation-phase shape, after dedup + file attribution)
export interface StatisticsEntry {
    timestamp: string;
    usage: {
        input_tokens?: number;
        output_tokens?: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
        // Part of cache_creation_input_tokens written with the 1-hour TTL (billed 2x input)
        cache_creation_1h_input_tokens?: number;
    };
    costUSD: number;
    model: string;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    file: string;
}

// Cached file data (stores raw pre-dedup entries — dedup runs per statistics
// run in the main thread, phase 2 of the two-phase pipeline)
interface CachedFileData {
    fileTimestamp: number;   // File last modification time (stats.mtimeMs) - for detecting file changes
    cachedAt: number;        // Cache creation time (Date.now()) - for expiry checking
    entries: RawStatsEntry[];  // Raw narrow-field entries (not deduplicated)
    hash: string;          // File content hash (for detecting changes)
}

// Aggregated data cache
interface AggregatedCacheEntry {
    data: any;
    timestamp: number;
    key: string;
}

// Disk cache persistence schema (PRD updatePRDv18 F2.3)
// Hit condition: BOTH mtimeMs and size match — mtime alone can be unreliable
// across some filesystems/copies (lesson from CLAUDE.md gotcha 6: file-change
// detection and cache-age semantics must never share one field)
interface DiskCacheFileEntry {
    mtimeMs: number;
    size: number;
    entries: RawStatsEntry[];
}

interface DiskCacheData {
    schemaVersion: number;
    files: Record<string, DiskCacheFileEntry>;
}

/**
 * Statistics data cache manager
 * Implements incremental updates and performance optimization
 */
export class StatisticsCache {
    // File-level cache: stores processing results for each file
    private fileCache = new Map<string, CachedFileData>();

    // Aggregated result cache: stores computed aggregation results
    private aggregatedCache = new Map<string, AggregatedCacheEntry>();

    // Cache expiry time: 5 minutes
    private readonly CACHE_EXPIRY_TIME = 5 * 60 * 1000;

    // Maximum number of cached files
    private readonly MAX_CACHED_FILES = 1000;

    // ---- Disk persistence layer (PRD updatePRDv18 F2.3) ----
    // v2 (4.1.8): entries carry cache_creation_1h_input_tokens for 1-hour cache write pricing
    private static readonly DISK_SCHEMA_VERSION = 2;
    private diskCachePath: string | null = null;
    private diskCache: DiskCacheData = { schemaVersion: StatisticsCache.DISK_SCHEMA_VERSION, files: {} };
    private diskCacheDirty = false;

    /**
     * Load the disk cache from <storageDir>/stats-cache.json.
     * Missing/corrupt file or schemaVersion mismatch → silently start empty
     * (full rebuild). Must be awaited before the first statistics run.
     */
    async initDiskCache(storageDir: string): Promise<void> {
        await fs.promises.mkdir(storageDir, { recursive: true });
        this.diskCachePath = path.join(storageDir, 'stats-cache.json');
        try {
            const rawText = await fs.promises.readFile(this.diskCachePath, 'utf8');
            const parsed = JSON.parse(rawText);
            if (parsed && parsed.schemaVersion === StatisticsCache.DISK_SCHEMA_VERSION && parsed.files) {
                this.diskCache = parsed;
            }
            // schemaVersion mismatch: keep the empty structure → full rebuild
        } catch {
            // No cache file or corrupt JSON → treat as cold start
        }
    }

    /**
     * Disk-layer lookup: hit only when both mtimeMs and size match exactly.
     */
    getDiskEntries(filePath: string, mtimeMs: number, size: number): RawStatsEntry[] | null {
        const e = this.diskCache.files[filePath];
        if (e && e.mtimeMs === mtimeMs && e.size === size) {
            return e.entries;
        }
        return null;
    }

    /**
     * Record freshly parsed entries into the in-memory disk mirror.
     * Persisted later by flushDiskCache().
     */
    updateDiskEntry(filePath: string, mtimeMs: number, size: number, entries: RawStatsEntry[]): void {
        this.diskCache.files[filePath] = { mtimeMs, size, entries };
        this.diskCacheDirty = true;
    }

    /**
     * One-shot async persistence after a statistics run:
     * prunes entries for deleted files, then atomically replaces the cache
     * file (write to .tmp + rename) to avoid torn writes.
     */
    async flushDiskCache(existingFiles: Set<string>): Promise<void> {
        if (!this.diskCachePath) {
            return;
        }

        for (const key of Object.keys(this.diskCache.files)) {
            if (!existingFiles.has(key)) {
                delete this.diskCache.files[key];
                this.diskCacheDirty = true;
            }
        }

        if (!this.diskCacheDirty) {
            return;
        }

        const tmpPath = this.diskCachePath + '.tmp';
        await fs.promises.writeFile(tmpPath, JSON.stringify(this.diskCache), 'utf8');
        await fs.promises.rename(tmpPath, this.diskCachePath);
        this.diskCacheDirty = false;
    }

    /**
     * Memory-layer lookup: hit when the caller-provided mtime matches the
     * cached fileTimestamp and the entry is within its TTL. On TTL expiry the
     * caller falls through to the disk layer (mtime+size check) instead of
     * re-parsing.
     */
    getValidCachedEntries(filePath: string, mtimeMs: number): RawStatsEntry[] | null {
        const cachedData = this.fileCache.get(filePath);
        if (!cachedData) {
            return null;
        }
        if (cachedData.fileTimestamp !== mtimeMs) {
            return null;
        }
        if (Date.now() - cachedData.cachedAt > this.CACHE_EXPIRY_TIME) {
            return null;
        }
        return cachedData.entries;
    }

    /**
     * Update file cache
     * @param filePath File path
     * @param entries Processed entries
     * @param timestamp File modification time
     */
    updateCache(filePath: string, entries: RawStatsEntry[], timestamp: number): void {
        // Calculate file content hash (simplified, can use actual file content)
        const hash = crypto.createHash('md5')
            .update(filePath + timestamp)
            .digest('hex');

        this.fileCache.set(filePath, {
            fileTimestamp: timestamp,
            cachedAt: Date.now(),
            entries,
            hash
        });

        // Limit cache size
        if (this.fileCache.size > this.MAX_CACHED_FILES) {
            this.cleanOldestCache();
        }
    }

    /**
     * Get aggregated cache
     * @param key Cache key
     * @param type Statistics type
     * @returns Cached aggregated data, or null if not found or expired
     */
    getAggregatedCache(key: string, type: string): any | null {
        const cacheKey = `${type}_${key}`;
        const cached = this.aggregatedCache.get(cacheKey);

        if (!cached) {
            return null;
        }

        // Check if expired
        const now = Date.now();
        if (now - cached.timestamp > this.CACHE_EXPIRY_TIME) {
            this.aggregatedCache.delete(cacheKey);
            return null;
        }

        return cached.data;
    }

    /**
     * Update aggregated cache
     * @param key Cache key
     * @param type Statistics type
     * @param data Aggregated data
     */
    updateAggregatedCache(key: string, type: string, data: any): void {
        const cacheKey = `${type}_${key}`;
        this.aggregatedCache.set(cacheKey, {
            data,
            timestamp: Date.now(),
            key: cacheKey
        });
    }

    /**
     * Clean expired cache
     */
    cleanExpiredCache(): void {
        const now = Date.now();

        // Clean file cache
        for (const [path, data] of this.fileCache.entries()) {
            if (now - data.cachedAt > this.CACHE_EXPIRY_TIME) {
                this.fileCache.delete(path);
            }
        }

        // Clean aggregated cache
        for (const [key, data] of this.aggregatedCache.entries()) {
            if (now - data.timestamp > this.CACHE_EXPIRY_TIME) {
                this.aggregatedCache.delete(key);
            }
        }
    }

    /**
     * Clean oldest cache entries (when cache size exceeds limit)
     */
    private cleanOldestCache(): void {
        // Sort by cache creation time, delete oldest 10%
        const sortedEntries = Array.from(this.fileCache.entries())
            .sort((a, b) => a[1].cachedAt - b[1].cachedAt);

        const deleteCount = Math.floor(sortedEntries.length * 0.1);
        for (let i = 0; i < deleteCount; i++) {
            this.fileCache.delete(sortedEntries[i][0]);
        }
    }

    /**
     * Clear all cache
     */
    clearAllCache(): void {
        this.fileCache.clear();
        this.aggregatedCache.clear();
    }

    /**
     * Get cache statistics
     */
    getCacheStats(): {
        fileCacheSize: number;
        aggregatedCacheSize: number;
    } {
        return {
            fileCacheSize: this.fileCache.size,
            aggregatedCacheSize: this.aggregatedCache.size
        };
    }
}