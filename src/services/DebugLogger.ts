/**
 * DebugLogger Service
 *
 * Provides circular buffer logging with automatic file writing for Claude to read
 * Only enabled in development mode
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export class DebugLogger {
    private static instance: DebugLogger | null = null;

    private logBuffer: string[] = [];
    private maxLines: number = 0;  // 0 means no line limit, keep all logs
    private logFile: string | null = null;
    private enabled: boolean = false;
    private writeTimer: NodeJS.Timeout | null = null;
    private pendingWrite: boolean = false;

    private constructor() {}

    /**
     * Get singleton instance
     */
    public static getInstance(): DebugLogger {
        if (!DebugLogger.instance) {
            DebugLogger.instance = new DebugLogger();
        }
        return DebugLogger.instance;
    }

    /**
     * Initialize logging service
     * @param workspacePath Workspace path
     * @param enabled Whether to enable logging
     */
    public initialize(workspacePath: string | undefined, enabled: boolean = false): void {
        this.enabled = enabled;

        if (workspacePath && enabled) {
            this.logFile = path.join(workspacePath, 'debug_log.txt');
            // Rotate log file: backup existing log file to .bak
            this.rotateLogFile(this.logFile);
            this.log('DebugLogger', 'Debug logging enabled', { logFile: this.logFile, backupFile: this.logFile.replace('.txt', '.bak') });
        } else if (enabled) {
            // Use global storage location when no workspace
            const homeDir = process.env.HOME || process.env.USERPROFILE || '';
            const claudeDir = path.join(homeDir, '.claude-code-chatui');

            // Ensure directory exists
            if (!fs.existsSync(claudeDir)) {
                fs.mkdirSync(claudeDir, { recursive: true });
            }

            this.logFile = path.join(claudeDir, 'debug_log.txt');
            // Rotate log file
            this.rotateLogFile(this.logFile);
            this.log('DebugLogger', 'Debug logging enabled (global location)', { logFile: this.logFile, backupFile: this.logFile.replace('.txt', '.bak') });
        }
    }

    /**
     * Rotate log file
     * Rename existing debug_log.txt to debug_log.bak (overwrite old backup)
     * This keeps two files: current session + previous session
     * @param logFilePath Log file path
     */
    private rotateLogFile(logFilePath: string): void {
        try {
            if (fs.existsSync(logFilePath)) {
                const backupPath = logFilePath.replace('.txt', '.bak');
                // Rename existing log file to .bak (overwrites old .bak file)
                fs.renameSync(logFilePath, backupPath);
                console.log(`[DebugLogger] Backed up previous session log: ${backupPath}`);
            }
        } catch (error) {
            // Backup failure doesn't affect normal logging, just output warning
            console.warn('[DebugLogger] Failed to backup log file:', error);
        }
    }

    /**
     * Log a message
     * @param tag Module tag
     * @param message Log message
     * @param data Additional data (optional)
     */
    public log(tag: string, message: string, data?: any): void {
        const timestamp = new Date().toISOString();
        const header = `[${timestamp}] [${tag}] ${message}`;

        // Add header line
        this.logBuffer.push(header);

        // If data exists, format JSON nicely (one field per line for readability)
        if (data !== undefined) {
            try {
                const dataStr = typeof data === 'object'
                    ? JSON.stringify(data, null, 2)  // Format JSON with 2-space indent
                    : String(data);

                // Add each JSON line to buffer (with indent)
                const lines = dataStr.split('\n');
                for (const line of lines) {
                    this.logBuffer.push('  ' + line);  // Indent data display
                }
            } catch (e) {
                this.logBuffer.push('  [Unserializable data]');
            }
        }

        // Add empty line to separate log entries
        this.logBuffer.push('');

        // Remove old entries when exceeding max lines (0 means no limit)
        if (this.maxLines > 0) {
            while (this.logBuffer.length > this.maxLines) {
                this.logBuffer.shift();
            }
        }

        // Also output to console (preserve original behavior)
        if (data !== undefined) {
            console.log(`[${tag}] ${message}`, data);
        } else {
            console.log(`[${tag}] ${message}`);
        }

        // Delayed file write (avoid frequent IO)
        if (this.enabled && this.logFile) {
            this.scheduleWrite();
        }
    }

    /**
     * Log an error
     */
    public error(tag: string, message: string, error?: Error | any): void {
        let errorInfo: any = {};

        if (error instanceof Error) {
            errorInfo = {
                name: error.name,
                message: error.message,
                stack: error.stack?.split('\n').slice(0, 5).join('\n')  // Keep only first 5 stack lines
            };
        } else if (error) {
            errorInfo = error;
        }

        this.log(`${tag}:ERROR`, message, errorInfo);
    }

    /**
     * Log a warning
     */
    public warn(tag: string, message: string, data?: any): void {
        this.log(`${tag}:WARN`, message, data);
    }

    /**
     * Schedule delayed file write (debounce)
     */
    private scheduleWrite(): void {
        if (this.pendingWrite) return;

        this.pendingWrite = true;

        // Write after 100ms, merge multiple calls
        if (this.writeTimer) {
            clearTimeout(this.writeTimer);
        }

        this.writeTimer = setTimeout(() => {
            this.writeToFile();
            this.pendingWrite = false;
        }, 100);
    }

    /**
     * Write to file
     */
    private writeToFile(): void {
        if (!this.logFile || !this.enabled) return;

        try {
            const content = this.logBuffer.join('\n');
            fs.writeFileSync(this.logFile, content, 'utf8');
        } catch (error) {
            // Don't recursively call log on write failure, output directly to console
            console.error('[DebugLogger] Failed to write log file:', error);
        }
    }

    /**
     * Flush logs to file immediately
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
     * Get recent log lines
     * @param count Number of lines
     */
    public getRecentLogs(count: number = 50): string[] {
        return this.logBuffer.slice(-count);
    }

    /**
     * Get log file path
     */
    public getLogFilePath(): string | null {
        return this.logFile;
    }

    /**
     * Check if logging is enabled
     */
    public isEnabled(): boolean {
        return this.enabled;
    }

    /**
     * Enable/disable logging
     */
    public setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        if (enabled) {
            this.log('DebugLogger', 'Debug logging enabled');
        } else {
            this.flush();  // Flush before disabling
            console.log('[DebugLogger] Debug logging disabled');
        }
    }

    /**
     * Clear logs
     */
    public clear(): void {
        this.logBuffer = [];
        if (this.logFile && fs.existsSync(this.logFile)) {
            try {
                fs.writeFileSync(this.logFile, '', 'utf8');
            } catch (e) {
                // Ignore
            }
        }
    }

    /**
     * Dispose instance
     */
    public dispose(): void {
        this.flush();
        if (this.writeTimer) {
            clearTimeout(this.writeTimer);
        }
        DebugLogger.instance = null;
    }
}

// Export convenience functions
export const debugLog = (tag: string, message: string, data?: any) => {
    DebugLogger.getInstance().log(tag, message, data);
};

export const debugError = (tag: string, message: string, error?: Error | any) => {
    DebugLogger.getInstance().error(tag, message, error);
};

export const debugWarn = (tag: string, message: string, data?: any) => {
    DebugLogger.getInstance().warn(tag, message, data);
};
