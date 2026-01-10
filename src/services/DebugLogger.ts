/**
 * DebugLogger 服务
 *
 * 提供循环缓冲日志功能，自动写入文件供 Claude 读取
 * 仅在开发模式下启用
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export class DebugLogger {
    private static instance: DebugLogger | null = null;

    private logBuffer: string[] = [];
    private maxLines: number = 0;  // 0 表示不限制行数，保留所有日志
    private logFile: string | null = null;
    private enabled: boolean = false;
    private writeTimer: NodeJS.Timeout | null = null;
    private pendingWrite: boolean = false;

    private constructor() {}

    /**
     * 获取单例实例
     */
    public static getInstance(): DebugLogger {
        if (!DebugLogger.instance) {
            DebugLogger.instance = new DebugLogger();
        }
        return DebugLogger.instance;
    }

    /**
     * 初始化日志服务
     * @param workspacePath 工作区路径
     * @param enabled 是否启用
     */
    public initialize(workspacePath: string | undefined, enabled: boolean = false): void {
        this.enabled = enabled;

        if (workspacePath && enabled) {
            this.logFile = path.join(workspacePath, 'debug_log.txt');
            this.log('DebugLogger', '调试日志已启用', { logFile: this.logFile, maxLines: this.maxLines });
        } else if (enabled) {
            // 没有工作区时使用全局存储位置
            const homeDir = process.env.HOME || process.env.USERPROFILE || '';
            const claudeDir = path.join(homeDir, '.claude-code-chatui');

            // 确保目录存在
            if (!fs.existsSync(claudeDir)) {
                fs.mkdirSync(claudeDir, { recursive: true });
            }

            this.logFile = path.join(claudeDir, 'debug_log.txt');
            this.log('DebugLogger', '调试日志已启用（全局位置）', { logFile: this.logFile });
        }
    }

    /**
     * 记录日志
     * @param tag 模块标签
     * @param message 日志消息
     * @param data 附加数据（可选）
     */
    public log(tag: string, message: string, data?: any): void {
        const timestamp = new Date().toISOString();
        const header = `[${timestamp}] [${tag}] ${message}`;

        // 添加头部行
        this.logBuffer.push(header);

        // 如果有数据，美化输出 JSON（每个字段一行，方便阅读）
        if (data !== undefined) {
            try {
                const dataStr = typeof data === 'object'
                    ? JSON.stringify(data, null, 2)  // 美化 JSON，缩进2空格
                    : String(data);

                // 将 JSON 的每一行都添加到缓冲区（带缩进）
                const lines = dataStr.split('\n');
                for (const line of lines) {
                    this.logBuffer.push('  ' + line);  // 缩进显示数据
                }
            } catch (e) {
                this.logBuffer.push('  [无法序列化的数据]');
            }
        }

        // 添加空行分隔不同的日志条目
        this.logBuffer.push('');

        // 超出最大行数时移除旧的（0 表示不限制）
        if (this.maxLines > 0) {
            while (this.logBuffer.length > this.maxLines) {
                this.logBuffer.shift();
            }
        }

        // 同时输出到控制台（保持原有行为）
        if (data !== undefined) {
            console.log(`[${tag}] ${message}`, data);
        } else {
            console.log(`[${tag}] ${message}`);
        }

        // 延迟写入文件（避免频繁 IO）
        if (this.enabled && this.logFile) {
            this.scheduleWrite();
        }
    }

    /**
     * 记录错误
     */
    public error(tag: string, message: string, error?: Error | any): void {
        let errorInfo: any = {};

        if (error instanceof Error) {
            errorInfo = {
                name: error.name,
                message: error.message,
                stack: error.stack?.split('\n').slice(0, 5).join('\n')  // 只保留前5行堆栈
            };
        } else if (error) {
            errorInfo = error;
        }

        this.log(`${tag}:ERROR`, message, errorInfo);
    }

    /**
     * 记录警告
     */
    public warn(tag: string, message: string, data?: any): void {
        this.log(`${tag}:WARN`, message, data);
    }

    /**
     * 延迟写入文件（防抖）
     */
    private scheduleWrite(): void {
        if (this.pendingWrite) return;

        this.pendingWrite = true;

        // 100ms 后写入，合并多次调用
        if (this.writeTimer) {
            clearTimeout(this.writeTimer);
        }

        this.writeTimer = setTimeout(() => {
            this.writeToFile();
            this.pendingWrite = false;
        }, 100);
    }

    /**
     * 写入文件
     */
    private writeToFile(): void {
        if (!this.logFile || !this.enabled) return;

        try {
            const content = this.logBuffer.join('\n');
            fs.writeFileSync(this.logFile, content, 'utf8');
        } catch (error) {
            // 写入失败时不要递归调用 log，直接输出到控制台
            console.error('[DebugLogger] 写入日志文件失败:', error);
        }
    }

    /**
     * 立即刷新日志到文件
     */
    public flush(): void {
        if (this.writeTimer) {
            clearTimeout(this.writeTimer);
            this.writeTimer = null;
        }
        this.writeToFile();
        this.pendingWrite = false;
    }

    /**
     * 获取最近的日志行
     * @param count 行数
     */
    public getRecentLogs(count: number = 50): string[] {
        return this.logBuffer.slice(-count);
    }

    /**
     * 获取日志文件路径
     */
    public getLogFilePath(): string | null {
        return this.logFile;
    }

    /**
     * 检查是否启用
     */
    public isEnabled(): boolean {
        return this.enabled;
    }

    /**
     * 启用/禁用日志
     */
    public setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        if (enabled) {
            this.log('DebugLogger', '调试日志已启用');
        } else {
            this.flush();  // 禁用前刷新
            console.log('[DebugLogger] 调试日志已禁用');
        }
    }

    /**
     * 清空日志
     */
    public clear(): void {
        this.logBuffer = [];
        if (this.logFile && fs.existsSync(this.logFile)) {
            try {
                fs.writeFileSync(this.logFile, '', 'utf8');
            } catch (e) {
                // 忽略
            }
        }
    }

    /**
     * 销毁实例
     */
    public dispose(): void {
        this.flush();
        if (this.writeTimer) {
            clearTimeout(this.writeTimer);
        }
        DebugLogger.instance = null;
    }
}

// 导出便捷函数
export const debugLog = (tag: string, message: string, data?: any) => {
    DebugLogger.getInstance().log(tag, message, data);
};

export const debugError = (tag: string, message: string, error?: Error | any) => {
    DebugLogger.getInstance().error(tag, message, error);
};

export const debugWarn = (tag: string, message: string, data?: any) => {
    DebugLogger.getInstance().warn(tag, message, data);
};
