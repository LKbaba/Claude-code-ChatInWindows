/**
 * Typography Styles - Text styles and formatting
 */

export const typographyStyles = `
/* ===================================
 * Typography Styles
 * =================================== */

/* Base Typography */
.text-xs { font-size: var(--font-size-xs); }
.text-sm { font-size: var(--font-size-sm); }
.text-base { font-size: var(--font-size-base); }
.text-md { font-size: var(--font-size-md); }
.text-lg { font-size: var(--font-size-lg); }
.text-xl { font-size: var(--font-size-xl); }
.text-2xl { font-size: var(--font-size-2xl); }

/* Font Weight */
.font-normal { font-weight: var(--font-weight-normal); }
.font-medium { font-weight: var(--font-weight-medium); }
.font-semibold { font-weight: var(--font-weight-semibold); }
.font-bold { font-weight: var(--font-weight-bold); }

/* Line Height */
.leading-tight { line-height: var(--line-height-tight); }
.leading-normal { line-height: var(--line-height-normal); }
.leading-relaxed { line-height: var(--line-height-relaxed); }

/* Text Alignment */
.text-left { text-align: left; }
.text-center { text-align: center; }
.text-right { text-align: right; }
.text-justify { text-align: justify; }

/* Text Transform */
.uppercase { text-transform: uppercase; }
.lowercase { text-transform: lowercase; }
.capitalize { text-transform: capitalize; }
.normal-case { text-transform: none; }

/* Text Decoration */
.underline { text-decoration: underline; }
.line-through { text-decoration: line-through; }
.no-underline { text-decoration: none; }

/* Text Color */
.text-primary { color: var(--vscode-foreground); }
.text-secondary { color: var(--vscode-descriptionForeground); }
.text-muted { color: var(--vscode-disabledForeground); }
.text-error { color: var(--vscode-errorForeground); }
.text-warning { color: var(--vscode-editorWarning-foreground); }
.text-success { color: var(--vscode-testing-iconPassed); }
.text-info { color: var(--vscode-editorInfo-foreground); }

/* Text Overflow */
.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.text-wrap { white-space: normal; }
.text-nowrap { white-space: nowrap; }
.text-break { word-break: break-word; }

/* Prose Styles (for markdown content) */
.prose {
  color: var(--vscode-foreground);
  max-width: 65ch;
  font-size: var(--font-size-base);
  line-height: var(--line-height-relaxed);
}

.prose > * + * {
  margin-top: var(--space-lg);
}

.prose h1,
.prose h2,
.prose h3,
.prose h4,
.prose h5,
.prose h6 {
  color: var(--vscode-foreground);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-tight);
  margin-top: var(--space-2xl);
  margin-bottom: var(--space-lg);
}

.prose h1 { font-size: var(--font-size-2xl); }
.prose h2 { font-size: var(--font-size-xl); }
.prose h3 { font-size: var(--font-size-lg); }
.prose h4 { font-size: var(--font-size-md); }
.prose h5 { font-size: var(--font-size-base); }
.prose h6 { font-size: var(--font-size-sm); }

.prose p {
  margin-top: var(--space-md);
  margin-bottom: var(--space-md);
}

.prose strong {
  color: var(--vscode-foreground);
  font-weight: var(--font-weight-semibold);
}

.prose em {
  font-style: italic;
}

.prose blockquote {
  border-left: 4px solid var(--vscode-textBlockQuote-border);
  padding-left: var(--space-lg);
  margin-left: 0;
  margin-right: 0;
  color: var(--vscode-textBlockQuote-background);
  font-style: italic;
}

.prose ul,
.prose ol {
  padding-left: var(--space-xl);
  margin-top: var(--space-md);
  margin-bottom: var(--space-md);
}

.prose ul {
  list-style-type: disc;
}

.prose ol {
  list-style-type: decimal;
}

.prose li {
  margin-top: var(--space-sm);
  margin-bottom: var(--space-sm);
}

.prose hr {
  border: none;
  border-top: 1px solid var(--vscode-panel-border);
  margin: var(--space-2xl) 0;
}

/* Code Styles */
.prose code {
  background-color: var(--vscode-textCodeBlock-background);
  color: var(--vscode-textPreformat-foreground);
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  font-family: var(--vscode-editor-font-family);
  font-size: 0.875em;
}

.prose pre {
  background: color-mix(in srgb, var(--grad-primary-start) 3%, var(--vscode-textCodeBlock-background));
  border: 1px solid color-mix(in srgb, var(--grad-primary-start) 10%, var(--vscode-panel-border));
  border-radius: var(--radius-md);
  padding: var(--space-lg);
  overflow-x: auto;
  margin: var(--space-lg) 0;
}

.prose pre code {
  background: transparent;
  padding: 0;
  border-radius: 0;
  font-size: inherit;
}

/* Link Styles */
.prose a {
  color: var(--vscode-textLink-foreground);
  text-decoration: underline;
  transition: color var(--transition-fast);
}

.prose a:hover {
  color: var(--vscode-textLink-activeForeground);
}

/* Table Styles */
.prose table {
  width: 100%;
  border-collapse: collapse;
  margin: var(--space-lg) 0;
}

.prose th,
.prose td {
  padding: var(--space-md);
  border: 1px solid var(--vscode-panel-border);
}

.prose th {
  background-color: var(--vscode-editor-selectionBackground);
  font-weight: var(--font-weight-semibold);
  text-align: left;
}

.prose tr:nth-child(even) {
  background-color: color-mix(in srgb, var(--vscode-editor-background) 95%, var(--vscode-editor-foreground));
}

/* Inline Code */
code {
  font-family: var(--vscode-editor-font-family);
  font-size: 0.875em;
  background-color: var(--vscode-textCodeBlock-background);
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
}

/* Preformatted Text */
pre {
  font-family: var(--vscode-editor-font-family);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-normal);
  white-space: pre;
  overflow: auto;
}

/* Selection */
::selection {
  background-color: var(--vscode-editor-selectionBackground);
  color: var(--vscode-editor-selectionForeground);
}

/* Placeholder Text */
::placeholder {
  color: var(--vscode-input-placeholderForeground);
  opacity: 1;
}

/* Accessibility */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

/* Letter Spacing */
.tracking-tight { letter-spacing: -0.025em; }
.tracking-normal { letter-spacing: 0; }
.tracking-wide { letter-spacing: 0.025em; }

/* Word Spacing */
.word-spacing-tight { word-spacing: -0.05em; }
.word-spacing-normal { word-spacing: normal; }
.word-spacing-wide { word-spacing: 0.1em; }

/* Text Shadow */
.text-shadow-sm { text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1); }
.text-shadow-md { text-shadow: 0 2px 4px rgba(0, 0, 0, 0.15); }
.text-shadow-lg { text-shadow: 0 4px 8px rgba(0, 0, 0, 0.2); }
.text-shadow-none { text-shadow: none; }
`;