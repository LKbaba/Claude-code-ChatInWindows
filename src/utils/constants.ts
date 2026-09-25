/**
 * Constants for Claude Code Chat VS Code Extension
 */

/**
 * Valid model names for Claude
 */
export const VALID_MODELS = [
    'opus',
    'sonnet',
    'default',
    'opusplan',                       // Opus Plan hybrid mode
    'claude-fable-5-1',               // Fable 5.1 - Latest flagship (Mythos-class), 1M context; requires CLI >= 2.1.251
    'claude-fable-5',                 // Fable 5 - 5th-gen flagship (Mythos-class), 1M context; requires CLI >= 2.1.170
    'claude-opus-5-5',                // Opus 5.5 - Latest Opus flagship, 1M context; requires CLI >= 2.1.280
    'claude-opus-4-8',                // Opus 4.8 - Latest flagship with adaptive thinking & enhanced reliability
    'claude-opus-4-7',                // Opus 4.7 - Legacy (hidden from UI but kept for history/pricing)
    'claude-opus-4-6',                // Opus 4.6 - Previous flagship with Adaptive Thinking
    'claude-opus-4-5-20251101',       // Opus 4.5 - Legacy (hidden from UI but kept for history/pricing)
    'claude-sonnet-5',                // Sonnet 5 - Most agentic Sonnet, new tokenizer; requires CLI >= 2.1.197
    'claude-sonnet-4-6',              // Sonnet 4.6 - Latest intelligent model
    'claude-sonnet-4-5-20250929',     // Sonnet 4.5 - Legacy (hidden from UI but kept for history/pricing)
    'claude-haiku-4-5-20251001'       // Haiku 4.5
] as const;
export type ValidModel = typeof VALID_MODELS[number];

/**
 * Model ID to display name mapping (single source of truth)
 */
export const MODEL_DISPLAY_NAMES: Record<string, string> = {
    'opus': 'Opus',
    'claude-fable-5-1': 'Fable 5.1',
    'claude-fable-5': 'Fable 5',
    'claude-opus-5-5': 'Opus 5.5',
    'claude-opus-4-8': 'Opus 4.8',
    'claude-opus-4-7': 'Opus 4.7',
    'claude-opus-4-6': 'Opus 4.6',
    'claude-opus-4-5-20251101': 'Opus 4.5',           // Kept for historical session display
    'claude-opus-4-20250514': 'Opus 4',
    'claude-3-opus-20240229': 'Claude 3 Opus',
    'opusplan': 'Opus Plan',
    'sonnet': 'Sonnet',
    'claude-sonnet-5': 'Sonnet 5',
    'claude-sonnet-4-6': 'Sonnet 4.6',
    'claude-sonnet-4-5-20250929': 'Sonnet 4.5',
    'claude-sonnet-4-20250514': 'Sonnet 4',
    'claude-3-5-sonnet-20241022': 'Sonnet 3.5',
    'claude-haiku-4-5-20251001': 'Haiku 4.5',
    'default': 'Default'
};

/**
 * Tool status mapping for displaying human-readable status messages
 */
export const TOOL_STATUS_MAP: Record<string, string> = {
    // Core tools (v2.1.72+)
    'Agent': 'Launching subagent',
    'Task': 'Launching subagent',              // Legacy alias for Agent
    'Bash': 'Executing command',
    'Read': 'Reading file',
    'Edit': 'Editing file',
    'Write': 'Writing file',
    'Grep': 'Searching files',
    'Glob': 'Finding files',
    'TodoWrite': 'Updating tasks',
    'WebFetch': 'Fetching web content',
    'WebSearch': 'Searching web',
    'NotebookEdit': 'Editing notebook',
    'ToolSearch': 'Loading tool definitions',
    'PowerShell': 'Executing PowerShell',
    'LSP': 'Querying language server',
    'Monitor': 'Monitoring output',
    'Workflow': 'Running workflow',
    // Task list (replaces TodoWrite unless CLAUDE_CODE_ENABLE_TASKS=0)
    'TaskCreate': 'Creating task',
    'TaskUpdate': 'Updating task',
    'TaskList': 'Listing tasks',
    'TaskGet': 'Reading task',
    // Background tasks & agents
    'TaskStop': 'Stopping task',
    'SendMessage': 'Messaging agent',
    'ListAgents': 'Listing agents',
    // Scheduling & notifications
    'CronCreate': 'Scheduling task',
    'CronDelete': 'Cancelling scheduled task',
    'CronList': 'Listing scheduled tasks',
    'ScheduleWakeup': 'Scheduling next run',
    'PushNotification': 'Sending notification',
    'SendUserFile': 'Sending file',
    // MCP helpers
    'WaitForMcpServers': 'Waiting for MCP servers',
    'ListMcpResourcesTool': 'Listing MCP resources',
    'ReadMcpResourceTool': 'Reading MCP resource',
    // User interaction
    'AskUserQuestion': 'Waiting for user input',
    'Skill': 'Executing skill',
    // Plan mode
    'EnterPlanMode': 'Entering plan mode',
    'ExitPlanMode': 'Exiting plan mode',
    // Worktree isolation
    'EnterWorktree': 'Creating worktree',
    'ExitWorktree': 'Exiting worktree',
    // Legacy tools (may still appear in older sessions)
    'TaskOutput': 'Getting task output',        // Removed in CLI 2.1.277
    'MultiEdit': 'Editing multiple files',
    'KillShell': 'Stopping background task',
    'NotebookRead': 'Reading notebook',
    'LS': 'Listing directory',
    // MCP tools
    'mcp__context7__resolve-library-id': 'Resolving library via Context7',
    'mcp__context7__query-docs': 'Querying docs via Context7'
};

/**
 * Default tool status when no specific mapping exists
 */
export const DEFAULT_TOOL_STATUS = 'Processing';

/**
 * Read tool default limits to prevent large file errors
 */
export const READ_TOOL_DEFAULTS = {
    DEFAULT_OFFSET: 0,
    DEFAULT_LIMIT: 2000,
    CONSERVATIVE_LIMIT: 500
} as const;

/**
 * File size limits
 */
export const FILE_SIZE_LIMITS = {
    WARNING_THRESHOLD: 1024 * 1024, // 1MB
    MAX_DISPLAY_SIZE: 1024 * 1024   // 1MB
} as const;

/**
 * Per-model context window sizes (tokens).
 *
 * Data source: official model docs as of 2026-07 (manually maintained,
 * no online fetching by design — see PRD updatePRDv18 §6).
 * Keys are normalized model IDs (no date suffix, no "[1m]" suffix);
 * lookups fall back to prefix matching via getModelContextWindow().
 */
export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
    // 1M-context models
    'claude-fable-5-1': 1_000_000,
    'claude-fable-5': 1_000_000,
    'claude-sonnet-5': 1_000_000,
    'claude-opus-5-5': 1_000_000,
    'claude-opus-4-8': 1_000_000,
    'claude-opus-4-7': 1_000_000,
    'claude-opus-4-6': 1_000_000,
    'claude-sonnet-4-6': 1_000_000,
    // 200K-context models
    'claude-opus-4-5': 200_000,
    'claude-sonnet-4-5': 200_000,
    'claude-haiku-4-5': 200_000
};

/**
 * Fallback context window for unknown models (tokens)
 */
export const DEFAULT_CONTEXT_WINDOW = 200_000;

/**
 * Normalize a model ID for table lookups:
 * - strips a trailing "[1m]" context suffix (defensive — window lookups
 *   normally happen before suffix injection)
 * - strips a trailing date suffix like "-20251001"
 */
export function normalizeModelId(modelId: string): string {
    return modelId
        .replace(/\[1m\]$/i, '')
        .replace(/-\d{8}$/, '');
}

/**
 * Resolve the context window size (tokens) for a model ID.
 * Lookup order: exact match → normalized match → prefix match
 * (table key is a prefix of the normalized ID) → DEFAULT_CONTEXT_WINDOW.
 */
export function getModelContextWindow(modelId: string): number {
    const exact = MODEL_CONTEXT_WINDOWS[modelId];
    if (exact !== undefined) {
        return exact;
    }

    const normalized = normalizeModelId(modelId);
    const normalizedMatch = MODEL_CONTEXT_WINDOWS[normalized];
    if (normalizedMatch !== undefined) {
        return normalizedMatch;
    }

    for (const [key, window] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
        if (normalized.startsWith(key)) {
            return window;
        }
    }

    return DEFAULT_CONTEXT_WINDOW;
}

/**
 * Whether the model supports a 1M-token context window
 * (used to decide "[1m]" suffix injection at CLI spawn time)
 */
export function isOneMillionContextModel(modelId: string): boolean {
    return getModelContextWindow(modelId) === 1_000_000;
}