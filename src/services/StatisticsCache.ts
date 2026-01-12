import * as fs from 'fs';
import * as crypto from 'crypto';

// Statistics entry type
export interface StatisticsEntry {
    timestamp: string;
    usage: {
        input_tokens?: number;
        output_tokens?: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
    };
    costUSD: number;
    model: string;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    file: string;
}

// Cached file data
interface CachedFileData {
    timestamp: number;      // File last modification time
    entries: StatisticsEntry[];  // Processed data entries
    hash: string;          // File content hash (for detecting changes)
}

// Aggregated data cache
interface AggregatedCacheEntry {
    data: any;
    timestamp: number;
    key: string;
}

/**
 * Statistics data cache manager
 * Implements incremental updates and performance optimization
 */
export class StatisticsCache {
    // File-level cache: stores processing results for each file
    private fileCache = new Map<string, CachedFileData>();

    // Set of processed message hashes: for deduplication
    private processedHashes = new Set<string>();

    // Aggregated result cache: stores computed aggregation results
    private aggregatedCache = new Map<string, AggregatedCacheEntry>();

    // Cache expiry time: 5 minutes
    private readonly CACHE_EXPIRY_TIME = 5 * 60 * 1000;

    // Maximum number of cached files
    private readonly MAX_CACHED_FILES = 1000;

    /**
     * Check if file needs to be re-read
     * @param filePath File path
     * @returns true if update needed, false if cache can be used
     */
    async needsUpdate(filePath: string): Promise<boolean> {
        try {
            const stats = await fs.promises.stat(filePath);
            const currentTimestamp = stats.mtimeMs;

            const cachedData = this.fileCache.get(filePath);
            if (!cachedData) {
                return true; // No cache, need to read
            }

            // Check if file was modified
            if (cachedData.timestamp !== currentTimestamp) {
                return true; // File modified, need to re-read
            }

            // Check if cache expired
            const now = Date.now();
            if (now - cachedData.timestamp > this.CACHE_EXPIRY_TIME) {
                return true; // Cache expired, need to update
            }

            return false; // Can use cache
        } catch (error) {
            // File doesn't exist or inaccessible, need to update
            return true;
        }
    }

    /**
     * Get cached entries
     * @param filePath File path
     * @returns Cached entries array, or null if no cache
     */
    getCachedEntries(filePath: string): StatisticsEntry[] | null {
        const cachedData = this.fileCache.get(filePath);
        return cachedData ? cachedData.entries : null;
    }

    /**
     * Update file cache
     * @param filePath File path
     * @param entries Processed entries
     * @param timestamp File modification time
     */
    updateCache(filePath: string, entries: StatisticsEntry[], timestamp: number): void {
        // Calculate file content hash (simplified, can use actual file content)
        const hash = crypto.createHash('md5')
            .update(filePath + timestamp)
            .digest('hex');

        this.fileCache.set(filePath, {
            timestamp,
            entries,
            hash
        });

        // Limit cache size
        if (this.fileCache.size > this.MAX_CACHED_FILES) {
            this.cleanOldestCache();
        }
    }

    /**
     * Check if message is already processed
     * @param hash Message hash
     * @returns true if already processed
     */
    isProcessed(hash: string): boolean {
        return this.processedHashes.has(hash);
    }

    /**
     * Mark message as processed
     * @param hash Message hash
     */
    markAsProcessed(hash: string): void {
        this.processedHashes.add(hash);
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
            if (now - data.timestamp > this.CACHE_EXPIRY_TIME) {
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
        // Sort by timestamp, delete oldest 10%
        const sortedEntries = Array.from(this.fileCache.entries())
            .sort((a, b) => a[1].timestamp - b[1].timestamp);

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
        this.processedHashes.clear();
        this.aggregatedCache.clear();
    }

    /**
     * Clear processed hash set
     * Used to reset deduplication state when switching statistics type
     */
    clearProcessedHashes(): void {
        this.processedHashes.clear();
    }

    /**
     * Get cache statistics
     */
    getCacheStats(): {
        fileCacheSize: number;
        processedHashesSize: number;
        aggregatedCacheSize: number;
    } {
        return {
            fileCacheSize: this.fileCache.size,
            processedHashesSize: this.processedHashes.size,
            aggregatedCacheSize: this.aggregatedCache.size
        };
    }
}