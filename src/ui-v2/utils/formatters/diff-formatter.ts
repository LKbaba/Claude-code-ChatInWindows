/**
 * Diff Formatter Utilities
 * Handles formatting of Edit, MultiEdit, and Write tool outputs
 */

import { escapeHtml, formatFilePath, formatToolInputUI, normalizePathForHtml } from './tool-formatter';

/**
 * Format Edit tool diff output
 */
export function formatEditToolDiff(input: any): string {
    if (!input || typeof input !== 'object') {
        return formatToolInputUI(input);
    }

    // Check if this is an Edit tool (has file_path, old_string, new_string)
    if (!input.file_path || !input.old_string || !input.new_string) {
        return formatToolInputUI(input);
    }

    // Format file path with better display
    const formattedPath = formatFilePath(input.file_path);
    const normalizedPath = normalizePathForHtml(input.file_path);
    let result = '<div class="diff-file-path" onclick="openFileInEditor(\'' + escapeHtml(normalizedPath) + '\')">' + formattedPath + '</div>\n';

    // Create diff view
    const oldLines = input.old_string.split('\n');
    const newLines = input.new_string.split('\n');
    const allLines = [...oldLines.map((line: string) => ({type: 'removed', content: line})), 
                     ...newLines.map((line: string) => ({type: 'added', content: line}))];
    
    const maxLines = 6;
    const shouldTruncate = allLines.length > maxLines;
    const visibleLines = shouldTruncate ? allLines.slice(0, maxLines) : allLines;
    const hiddenLines = shouldTruncate ? allLines.slice(maxLines) : [];
    
    result += '<div class="diff-container">';
    result += '<div class="diff-header">Changes:</div>';
    
    // Create a unique ID for this diff
    const diffId = 'diff_' + Math.random().toString(36).substr(2, 9);
    
    // Show visible lines
    result += '<div id="' + diffId + '_visible">';
    for (const line of visibleLines) {
        const prefix = line.type === 'removed' ? '- ' : '+ ';
        const cssClass = line.type === 'removed' ? 'removed' : 'added';
        result += '<div class="diff-line ' + cssClass + '">' + prefix + escapeHtml(line.content) + '</div>';
    }
    result += '</div>';
    
    // Show hidden lines (initially hidden)
    if (shouldTruncate) {
        result += '<div id="' + diffId + '_hidden" style="display: none;">';
        for (const line of hiddenLines) {
            const prefix = line.type === 'removed' ? '- ' : '+ ';
            const cssClass = line.type === 'removed' ? 'removed' : 'added';
            result += '<div class="diff-line ' + cssClass + '">' + prefix + escapeHtml(line.content) + '</div>';
        }
        result += '</div>';
        
        // Add expand button
        result += '<div class="diff-expand-container">';
        result += '<button class="diff-expand-btn" onclick="toggleDiffExpansion(\'' + diffId + '\')">Show ' + hiddenLines.length + ' more lines</button>';
        result += '</div>';
    }
    
    result += '</div>';
    
    // Add other properties if they exist
    for (const [key, value] of Object.entries(input)) {
        if (key !== 'file_path' && key !== 'old_string' && key !== 'new_string') {
            const valueStr = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
            result += '\n<strong>' + key + ':</strong> ' + valueStr;
        }
    }
    
    return result;
}

/**
 * Format single edit for MultiEdit
 */
function formatSingleEdit(edit: any, editNumber: number): string {
    let result = '<div class="single-edit">';
    result += '<div class="edit-number">Edit #' + editNumber + '</div>';
    
    // Create diff view for this single edit
    const oldLines = edit.old_string.split('\n');
    const newLines = edit.new_string.split('\n');
    
    // Show removed lines
    for (const line of oldLines) {
        result += '<div class="diff-line removed">- ' + escapeHtml(line) + '</div>';
    }
    
    // Show added lines
    for (const line of newLines) {
        result += '<div class="diff-line added">+ ' + escapeHtml(line) + '</div>';
    }
    
    result += '</div>';
    return result;
}

/**
 * Format MultiEdit tool diff output
 */
export function formatMultiEditToolDiff(input: any): string {
    if (!input || typeof input !== 'object') {
        return formatToolInputUI(input);
    }

    // Check if this is a MultiEdit tool (has file_path and edits array)
    if (!input.file_path || !input.edits || !Array.isArray(input.edits)) {
        return formatToolInputUI(input);
    }

    // Format file path with better display
    const formattedPath = formatFilePath(input.file_path);
    const normalizedPath = normalizePathForHtml(input.file_path);
    let result = '<div class="diff-file-path" onclick="openFileInEditor(\'' + escapeHtml(normalizedPath) + '\')">' + formattedPath + '</div>\n';

    // Count total lines across all edits for truncation
    let totalLines = 0;
    for (const edit of input.edits) {
        if (edit.old_string && edit.new_string) {
            const oldLines = edit.old_string.split('\n');
            const newLines = edit.new_string.split('\n');
            totalLines += oldLines.length + newLines.length;
        }
    }

    const maxLines = 6;
    const shouldTruncate = totalLines > maxLines;
    
    result += '<div class="diff-container">';
    result += '<div class="diff-header">Changes (' + input.edits.length + ' edit' + (input.edits.length > 1 ? 's' : '') + '):</div>';
    
    // Create a unique ID for this diff
    const diffId = 'multiedit_' + Math.random().toString(36).substr(2, 9);
    
    let currentLineCount = 0;
    let visibleEdits = [];
    let hiddenEdits = [];
    
    // Determine which edits to show/hide based on line count
    for (let i = 0; i < input.edits.length; i++) {
        const edit = input.edits[i];
        if (!edit.old_string || !edit.new_string) continue;
        
        const oldLines = edit.old_string.split('\n');
        const newLines = edit.new_string.split('\n');
        const editLines = oldLines.length + newLines.length;
        
        if (shouldTruncate && currentLineCount + editLines > maxLines && visibleEdits.length > 0) {
            hiddenEdits.push(edit);
        } else {
            visibleEdits.push(edit);
            currentLineCount += editLines;
        }
    }
    
    // Show visible edits
    result += '<div id="' + diffId + '_visible">';
    for (let i = 0; i < visibleEdits.length; i++) {
        const edit = visibleEdits[i];
        if (i > 0) result += '<div class="diff-edit-separator"></div>';
        result += formatSingleEdit(edit, i + 1);
    }
    result += '</div>';
    
    // Show hidden edits (initially hidden)
    if (hiddenEdits.length > 0) {
        result += '<div id="' + diffId + '_hidden" style="display: none;">';
        for (let i = 0; i < hiddenEdits.length; i++) {
            const edit = hiddenEdits[i];
            result += '<div class="diff-edit-separator"></div>';
            result += formatSingleEdit(edit, visibleEdits.length + i + 1);
        }
        result += '</div>';
        
        // Add expand button
        result += '<div class="diff-expand-container">';
        result += '<button class="diff-expand-btn" onclick="toggleDiffExpansion(\'' + diffId + '\')">Show ' + hiddenEdits.length + ' more edit' + (hiddenEdits.length > 1 ? 's' : '') + '</button>';
        result += '</div>';
    }
    
    result += '</div>';
    
    // Add other properties if they exist
    for (const [key, value] of Object.entries(input)) {
        if (key !== 'file_path' && key !== 'edits') {
            const valueStr = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
            result += '\n<strong>' + key + ':</strong> ' + valueStr;
        }
    }
    
    return result;
}

/**
 * Format Write tool diff output
 */
export function formatWriteToolDiff(input: any): string {
    if (!input || typeof input !== 'object') {
        return formatToolInputUI(input);
    }

    // Check if this is a Write tool (has file_path and content)
    if (!input.file_path || !input.content) {
        return formatToolInputUI(input);
    }

    // Format file path with better display
    const formattedPath = formatFilePath(input.file_path);
    const normalizedPath = normalizePathForHtml(input.file_path);
    let result = '<div class="diff-file-path" onclick="openFileInEditor(\'' + escapeHtml(normalizedPath) + '\')">' + formattedPath + '</div>\n';

    // Create diff view showing all content as additions
    const contentLines = input.content.split('\n');
    
    const maxLines = 6;
    const shouldTruncate = contentLines.length > maxLines;
    const visibleLines = shouldTruncate ? contentLines.slice(0, maxLines) : contentLines;
    const hiddenLines = shouldTruncate ? contentLines.slice(maxLines) : [];
    
    result += '<div class="diff-container">';
    result += '<div class="diff-header">New file content:</div>';
    
    // Create a unique ID for this diff
    const diffId = 'write_' + Math.random().toString(36).substr(2, 9);
    
    // Show visible lines (all as additions)
    result += '<div id="' + diffId + '_visible">';
    for (const line of visibleLines) {
        result += '<div class="diff-line added">+ ' + escapeHtml(line) + '</div>';
    }
    result += '</div>';
    
    // Show hidden lines (initially hidden)
    if (hiddenLines.length > 0) {
        result += '<div id="' + diffId + '_hidden" style="display: none;">';
        for (const line of hiddenLines) {
            result += '<div class="diff-line added">+ ' + escapeHtml(line) + '</div>';
        }
        result += '</div>';
        
        // Add expand button
        result += '<div class="diff-expand-container">';
        result += '<button class="diff-expand-btn" onclick="toggleDiffExpansion(\'' + diffId + '\')">Show ' + hiddenLines.length + ' more lines</button>';
        result += '</div>';
    }
    
    result += '</div>';
    
    // Add other properties if they exist
    for (const [key, value] of Object.entries(input)) {
        if (key !== 'file_path' && key !== 'content') {
            const valueStr = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
            result += '\n<strong>' + key + ':</strong> ' + valueStr;
        }
    }
    
    return result;
}

/**
 * Toggle diff expansion (this function needs to be exposed to window object)
 */
export function toggleDiffExpansion(id: string): void {
    const visible = document.getElementById(id + '_visible');
    const hidden = document.getElementById(id + '_hidden');
    const button = event?.target as HTMLButtonElement;
    
    if (hidden && visible && button) {
        if (hidden.style.display === 'none') {
            hidden.style.display = '';
            button.textContent = button.textContent ? button.textContent.replace('Show', 'Hide') : 'Hide more lines';
        } else {
            hidden.style.display = 'none';
            button.textContent = button.textContent ? button.textContent.replace('Hide', 'Show') : 'Show more lines';
        }
    }
}

// Export formatDiff as an alias for formatEditToolDiff for backward compatibility
export const formatDiff = formatEditToolDiff;