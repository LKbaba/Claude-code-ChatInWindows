/**
 * Markdown Parser
 * Simple markdown to HTML converter
 */

/**
 * Parse simple markdown to HTML
 * Supports: headers, bold, italic, lists, paragraphs
 */
export function parseSimpleMarkdown(markdown: string): string {
    const lines = markdown.split('\n');
    let html = '';
    let inUnorderedList = false;
    let inOrderedList = false;

    for (let line of lines) {
        line = line.trim();

        // Bold
        line = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        // Italic - only apply when underscores are surrounded by whitespace or at beginning/end
        line = line.replace(/(?<!\*)\*(?!\*)(.*?)\*(?!\*)/g, '<em>$1</em>');
        line = line.replace(/(^|\s)_([^_\s][^_]*[^_\s]|[^_\s])_(?=\s|$)/g, '$1<em>$2</em>');

        // Headers
        if (/^####\s+/.test(line)) {
            html += '<h4>' + line.replace(/^####\s+/, '') + '</h4>';
            continue;
        } else if (/^###\s+/.test(line)) {
            html += '<h3>' + line.replace(/^###\s+/, '') + '</h3>';
            continue;
        } else if (/^##\s+/.test(line)) {
            html += '<h2>' + line.replace(/^##\s+/, '') + '</h2>';
            continue;
        } else if (/^#\s+/.test(line)) {
            html += '<h1>' + line.replace(/^#\s+/, '') + '</h1>';
            continue;
        }

        // Ordered list
        if (/^\d+\.\s+/.test(line)) {
            if (!inOrderedList) {
                html += '<ol>';
                inOrderedList = true;
            }
            const item = line.replace(/^\d+\.\s+/, '');
            html += '<li>' + item + '</li>';
            continue;
        }

        // Unordered list
        if (line.startsWith('- ')) {
            if (!inUnorderedList) {
                html += '<ul>';
                inUnorderedList = true;
            }
            html += '<li>' + line.slice(2) + '</li>';
            continue;
        }

        // Close lists
        if (inUnorderedList) {
            html += '</ul>';
            inUnorderedList = false;
        }
        if (inOrderedList) {
            html += '</ol>';
            inOrderedList = false;
        }

        // Horizontal rule
        if (line === '---' || line === '***' || line === '___') {
            html += '<hr>';
            continue;
        }
        
        // Paragraph or break
        if (line !== '') {
            html += '<p>' + line + '</p>';
        } else {
            html += '<br>';
        }
    }

    // Close any open lists at the end
    if (inUnorderedList) html += '</ul>';
    if (inOrderedList) html += '</ol>';

    return html;
}

/**
 * Parse code blocks in markdown
 * Adds support for ```language``` code blocks
 */
export function parseCodeBlocks(text: string): string {
    // Replace code blocks with formatted HTML
    return text.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, language, code) => {
        const lang = language || 'plaintext';
        return `<pre><code class="language-${lang}">${escapeHtml(code.trim())}</code></pre>`;
    });
}

/**
 * Parse inline code
 * Adds support for `inline code`
 */
export function parseInlineCode(text: string): string {
    return text.replace(/`([^`]+)`/g, '<code>$1</code>');
}

/**
 * Full markdown parser with all features
 */
export function parseMarkdown(markdown: string): string {
    // First parse code blocks (to protect their content)
    let html = parseCodeBlocks(markdown);
    
    // Then parse inline code
    html = parseInlineCode(html);
    
    // Finally parse simple markdown
    html = parseSimpleMarkdown(html);
    
    return html;
}

/**
 * Helper to escape HTML
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