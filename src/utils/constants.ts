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
    'claude-opus-4-6',                // Opus 4.6 - Latest flagship with Adaptive Thinking
    'claude-opus-4-5-20251101',       // Opus 4.5
    'claude-sonnet-4-6',              // Sonnet 4.6 - Latest intelligent model
    'claude-sonnet-4-5-20250929',     // Sonnet 4.5
    'claude-haiku-4-5-20251001'       // Haiku 4.5
] as const;
export type ValidModel = typeof VALID_MODELS[number];

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
    // Task management
    'TaskOutput': 'Getting task output',
    'TaskStop': 'Stopping task',
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