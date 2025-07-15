import * as fs from 'fs';
import * as crypto from 'crypto';

// 统计数据条目的类型
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

// 缓存的文件数据
interface CachedFileData {
    timestamp: number;      // 文件最后修改时间
    entries: StatisticsEntry[];  // 已处理的数据条目
    hash: string;          // 文件内容哈希（用于检测内容变化）
}

// 聚合数据缓存
interface AggregatedCacheEntry {
    data: any;
    timestamp: number;
    key: string;
}

/**
 * 统计数据缓存管理器
 * 用于实现增量更新和性能优化
 */
export class StatisticsCache {
    // 文件级别的缓存：存储每个文件的处理结果
    private fileCache = new Map<string, CachedFileData>();
    
    // 已处理消息的哈希集合：用于去重
    private processedHashes = new Set<string>();
    
    // 聚合结果缓存：存储计算后的聚合结果
    private aggregatedCache = new Map<string, AggregatedCacheEntry>();
    
    // 缓存过期时间：5分钟
    private readonly CACHE_EXPIRY_TIME = 5 * 60 * 1000;
    
    // 最大缓存文件数量
    private readonly MAX_CACHED_FILES = 1000;

    /**
     * 检查文件是否需要重新读取
     * @param filePath 文件路径
     * @returns true 如果需要更新，false 如果可以使用缓存
     */
    async needsUpdate(filePath: string): Promise<boolean> {
        try {
            const stats = await fs.promises.stat(filePath);
            const currentTimestamp = stats.mtimeMs;
            
            const cachedData = this.fileCache.get(filePath);
            if (!cachedData) {
                return true; // 没有缓存，需要读取
            }
            
            // 检查文件是否被修改
            if (cachedData.timestamp !== currentTimestamp) {
                return true; // 文件被修改，需要重新读取
            }
            
            // 检查缓存是否过期
            const now = Date.now();
            if (now - cachedData.timestamp > this.CACHE_EXPIRY_TIME) {
                return true; // 缓存过期，需要更新
            }
            
            return false; // 可以使用缓存
        } catch (error) {
            // 文件不存在或无法访问，需要更新
            return true;
        }
    }

    /**
     * 获取缓存的条目
     * @param filePath 文件路径
     * @returns 缓存的条目数组，如果没有缓存则返回 null
     */
    getCachedEntries(filePath: string): StatisticsEntry[] | null {
        const cachedData = this.fileCache.get(filePath);
        return cachedData ? cachedData.entries : null;
    }

    /**
     * 更新文件缓存
     * @param filePath 文件路径
     * @param entries 处理后的条目
     * @param timestamp 文件修改时间
     */
    updateCache(filePath: string, entries: StatisticsEntry[], timestamp: number): void {
        // 计算文件内容哈希（简化版，实际可以使用文件内容）
        const hash = crypto.createHash('md5')
            .update(filePath + timestamp)
            .digest('hex');
        
        this.fileCache.set(filePath, {
            timestamp,
            entries,
            hash
        });
        
        // 限制缓存大小
        if (this.fileCache.size > this.MAX_CACHED_FILES) {
            this.cleanOldestCache();
        }
    }

    /**
     * 检查消息是否已处理
     * @param hash 消息哈希
     * @returns true 如果已处理
     */
    isProcessed(hash: string): boolean {
        return this.processedHashes.has(hash);
    }

    /**
     * 标记消息为已处理
     * @param hash 消息哈希
     */
    markAsProcessed(hash: string): void {
        this.processedHashes.add(hash);
    }

    /**
     * 获取聚合缓存
     * @param key 缓存键
     * @param type 统计类型
     * @returns 缓存的聚合数据，如果没有或过期则返回 null
     */
    getAggregatedCache(key: string, type: string): any | null {
        const cacheKey = `${type}_${key}`;
        const cached = this.aggregatedCache.get(cacheKey);
        
        if (!cached) {
            return null;
        }
        
        // 检查是否过期
        const now = Date.now();
        if (now - cached.timestamp > this.CACHE_EXPIRY_TIME) {
            this.aggregatedCache.delete(cacheKey);
            return null;
        }
        
        return cached.data;
    }

    /**
     * 更新聚合缓存
     * @param key 缓存键
     * @param type 统计类型
     * @param data 聚合数据
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
     * 清理过期缓存
     */
    cleanExpiredCache(): void {
        const now = Date.now();
        
        // 清理文件缓存
        for (const [path, data] of this.fileCache.entries()) {
            if (now - data.timestamp > this.CACHE_EXPIRY_TIME) {
                this.fileCache.delete(path);
            }
        }
        
        // 清理聚合缓存
        for (const [key, data] of this.aggregatedCache.entries()) {
            if (now - data.timestamp > this.CACHE_EXPIRY_TIME) {
                this.aggregatedCache.delete(key);
            }
        }
    }

    /**
     * 清理最旧的缓存（当缓存数量超过限制时）
     */
    private cleanOldestCache(): void {
        // 按时间戳排序，删除最旧的 10%
        const sortedEntries = Array.from(this.fileCache.entries())
            .sort((a, b) => a[1].timestamp - b[1].timestamp);
        
        const deleteCount = Math.floor(sortedEntries.length * 0.1);
        for (let i = 0; i < deleteCount; i++) {
            this.fileCache.delete(sortedEntries[i][0]);
        }
    }

    /**
     * 清空所有缓存
     */
    clearAllCache(): void {
        this.fileCache.clear();
        this.processedHashes.clear();
        this.aggregatedCache.clear();
    }

    /**
     * 清空已处理的哈希集合
     * 用于在切换统计类型时重置去重状态
     */
    clearProcessedHashes(): void {
        this.processedHashes.clear();
    }

    /**
     * 获取缓存统计信息
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