/**
 * Constants for Claude Code Chat VS Code Extension
 */

/**
 * Valid model names for Claude
 */
export const VALID_MODELS = ['opus', 'sonnet', 'default'] as const;
export type ValidModel = typeof VALID_MODELS[number];

/**
 * Tool status mapping for displaying human-readable status messages
 */
export const TOOL_STATUS_MAP: Record<string, string> = {
    'Task': 'Exploring project structure',
    'Bash': 'Executing command',
    'Read': 'Reading file',
    'Edit': 'Editing file',
    'Write': 'Writing file',
    'Grep': 'Searching files',
    'Glob': 'Finding files',
    'LS': 'Listing directory',
    'TodoWrite': 'Updating tasks',
    'TodoRead': 'Reading tasks',
    'WebFetch': 'Fetching web content',
    'WebSearch': 'Searching web',
    'MultiEdit': 'Editing multiple files',
    'NotebookRead': 'Reading notebook',
    'NotebookEdit': 'Editing notebook',
    'exit_plan_mode': 'Exiting plan mode',
    // MCP tools
    'mcp__sequential-thinking__sequentialthinking': 'Analyzing with sequential thinking',
    'mcp__context7__search': 'Searching documentation via Context7',
    'mcp__context7__get_context': 'Fetching context via Context7'
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