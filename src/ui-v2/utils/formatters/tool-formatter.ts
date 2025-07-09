/**
 * Tool Formatter Utilities
 * Extracted from ui.ts for formatting tool inputs and outputs
 */

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Format file path for display
 */
function formatFilePath(filePath: string): string {
    // Get last 2 parts of the path
    const parts = filePath.split(/[/\\]/);
    if (parts.length > 2) {
        return '.../' + parts.slice(-2).join('/');
    }
    return filePath;
}

/**
 * Format tool input for UI display
 * Handles various input types and provides expand/collapse functionality for long content
 */
export function formatToolInputUI(input: any): string {
    if (!input || typeof input !== 'object') {
        const str = String(input);
        if (str.length > 100) {
            const truncateAt = 97;
            const truncated = str.substring(0, truncateAt);
            const inputId = 'input_' + Math.random().toString(36).substr(2, 9);
            
            return '<span id="' + inputId + '_visible">' + escapeHtml(truncated) + '</span>' +
                   '<span id="' + inputId + '_ellipsis">...</span>' +
                   '<span id="' + inputId + '_hidden" style="display: none;">' + escapeHtml(str.substring(truncateAt)) + '</span>' +
                   '<div class="diff-expand-container">' +
                   '<button class="diff-expand-btn" onclick="toggleResultExpansion(\'' + inputId + '\')">Show more</button>' +
                   '</div>';
        }
        return str;
    }

    // Special handling for Read tool with file_path
    if (input.file_path && Object.keys(input).length === 1) {
        const formattedPath = formatFilePath(input.file_path);
        return '<div class="diff-file-path" onclick="openFileInEditor(\'' + escapeHtml(input.file_path) + '\')">' + formattedPath + '</div>';
    }
    
    // Special handling for Read tool with file_path and offset/limit
    if (input.file_path && (input.offset !== undefined || input.limit !== undefined)) {
        const formattedPath = formatFilePath(input.file_path);
        let result = '<div class="diff-file-path" onclick="openFileInEditor(\'' + escapeHtml(input.file_path) + '\')">' + formattedPath + '</div>';
        
        const extraParams = [];
        if (input.offset !== undefined) {
            extraParams.push(`offset: ${input.offset}`);
        }
        if (input.limit !== undefined) {
            extraParams.push(`limit: ${input.limit}`);
        }
        
        if (extraParams.length > 0) {
            result += ' <span style="color: #888; font-size: 0.9em;">(' + extraParams.join(', ') + ')</span>';
        }
        
        return result;
    }

    let result = '';
    let isFirst = true;
    for (const [key, value] of Object.entries(input)) {
        const valueStr = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
        
        if (!isFirst) result += '\n';
        isFirst = false;
        
        if (key === 'file_path') {
            const formattedPath = formatFilePath(value as string);
            result += '<strong>' + key + ':</strong> <span class="diff-file-path" onclick="openFileInEditor(\'' + escapeHtml(value as string) + '\')">' + formattedPath + '</span>';
        } else if (valueStr.length > 100) {
            const truncateAt = 97;
            const truncated = valueStr.substring(0, truncateAt);
            const fullId = 'full_' + Math.random().toString(36).substr(2, 9);
            
            result += '<strong>' + key + ':</strong> ' + 
                     '<span id="' + fullId + '_visible">' + escapeHtml(truncated) + '</span>' +
                     '<span id="' + fullId + '_ellipsis">...</span>' +
                     '<span id="' + fullId + '_hidden" style="display: none;">' + escapeHtml(valueStr.substring(truncateAt)) + '</span>' +
                     '<div class="diff-expand-container">' +
                     '<button class="diff-expand-btn" onclick="toggleResultExpansion(\'' + fullId + '\')">Show more</button>' +
                     '</div>';
        } else {
            result += '<strong>' + key + ':</strong> ' + escapeHtml(valueStr);
        }
    }
    
    return result;
}

/**
 * Toggle result expansion (this function needs to be exposed to window object)
 */
export function toggleResultExpansion(resultId: string): void {
    const hiddenDiv = document.getElementById(resultId + '_hidden');
    const ellipsis = document.getElementById(resultId + '_ellipsis');
    const button = document.querySelector('[onclick*="toggleResultExpansion(\'' + resultId + '\')"]');
    
    if (hiddenDiv && button) {
        if (hiddenDiv.style.display === 'none') {
            hiddenDiv.style.display = 'inline';
            if (ellipsis) ellipsis.style.display = 'none';
            (button as HTMLButtonElement).textContent = 'Show less';
        } else {
            hiddenDiv.style.display = 'none';
            if (ellipsis) ellipsis.style.display = 'inline';
            (button as HTMLButtonElement).textContent = 'Show more';
        }
    }
}

// Export helper functions for use in other formatters
export { escapeHtml, formatFilePath };