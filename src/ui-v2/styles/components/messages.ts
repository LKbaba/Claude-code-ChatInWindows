/**
 * Message Component Styles
 * Styles for chat messages, tool outputs, and related elements
 */

export const messageStyles = `
/* ===================================
 * Message Components
 * =================================== */

/* Base Message Styles */
.message {
  margin-bottom: var(--space-lg);
  padding: var(--space-lg);
  border-radius: var(--radius-lg);
  position: relative;
  word-wrap: break-word;
  overflow-wrap: break-word;
  animation: messageSlideIn 0.3s ease-out;
  transition: all var(--transition-fast);
  max-width: 100%;
}

.message:hover {
  box-shadow: var(--shadow-sm);
}

/* Message Variants */
.message.user {
  background-color: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border);
  margin-left: 20%;
  align-self: flex-end;
}

.message.claude,
.message.assistant {
  background: var(--color-message-assistant);
  border-left: 3px solid var(--grad-primary-start);
  margin-right: 10%;
  position: relative;
  overflow: hidden;
}

.message.claude::after,
.message.assistant::after {
  content: '';
  position: absolute;
  top: 50%;
  right: -100px;
  width: 200px;
  height: 200px;
  background: radial-gradient(
    circle,
    color-mix(in srgb, var(--grad-primary-end) 10%, transparent) 0%,
    transparent 70%
  );
  transform: translateY(-50%);
  pointer-events: none;
}

.message.error {
  background: var(--color-message-error);
  border-left: 3px solid #FF6B7A;
  color: var(--vscode-errorForeground);
}

.message.warning {
  background: var(--color-message-warning);
  border-left: 3px solid #FFC857;
}

.message.info,
.message.system {
  background-color: var(--vscode-editorInfo-background);
  border-left: 3px solid var(--vscode-editorInfo-foreground);
  font-style: italic;
  opacity: 0.9;
}

.message.thinking {
  background: color-mix(in srgb, var(--grad-thinking) 8%, var(--vscode-editor-background));
  border-left: 3px solid #B794F4;
  font-style: italic;
}

/* Message Content Formatting */
.message-content {
  font-size: var(--font-size-base);
  line-height: var(--line-height-relaxed);
  color: var(--vscode-foreground);
}

.message-content > *:first-child {
  margin-top: 0;
}

.message-content > *:last-child {
  margin-bottom: 0;
}

/* Message Header */
.message-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-bottom: var(--space-sm);
  font-size: var(--font-size-sm);
  color: var(--vscode-descriptionForeground);
}

.message-icon {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.message-timestamp {
  font-size: var(--font-size-xs);
  opacity: 0.7;
  margin-left: auto;
}

/* Tool Messages */
.message.tool {
  background: color-mix(in srgb, var(--grad-tool) 5%, var(--vscode-editor-background));
  border-left: 3px solid transparent;
  border-image: var(--grad-tool) 1;
  padding: var(--space-md);
  font-family: var(--vscode-editor-font-family);
  font-size: var(--font-size-sm);
}

.tool-header {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  background-color: var(--vscode-editor-selectionBackground);
  border-radius: var(--radius-sm);
  margin-bottom: var(--space-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.tool-header:hover {
  background-color: var(--vscode-editor-hoverHighlightBackground);
}

.tool-icon {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--grad-tool);
  color: white;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
}

.tool-name {
  font-weight: var(--font-weight-medium);
  color: var(--vscode-foreground);
}

.tool-status {
  margin-left: auto;
  font-size: var(--font-size-xs);
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.tool-status.pending {
  color: var(--vscode-editorWarning-foreground);
}

.tool-status.running {
  color: var(--vscode-testing-iconQueued);
}

.tool-status.success {
  color: var(--vscode-testing-iconPassed);
}

.tool-status.error {
  color: var(--vscode-testing-iconFailed);
}

/* Tool Content */
.tool-content {
  padding: var(--space-md);
  background-color: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: var(--radius-sm);
  overflow-x: auto;
}

.tool-input,
.tool-output {
  margin-bottom: var(--space-md);
}

.tool-input-label,
.tool-output-label {
  font-size: var(--font-size-xs);
  color: var(--vscode-descriptionForeground);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--space-sm);
}

.tool-result {
  padding: var(--space-md);
  background-color: var(--vscode-textCodeBlock-background);
  border-radius: var(--radius-sm);
  font-family: var(--vscode-editor-font-family);
  font-size: var(--font-size-sm);
  white-space: pre-wrap;
  overflow-x: auto;
}

.tool-result.error {
  background-color: var(--vscode-inputValidation-errorBackground);
  border: 1px solid var(--vscode-inputValidation-errorBorder);
  color: var(--vscode-errorForeground);
}

/* Tool Loading Animation */
.tool-loading {
  position: relative;
  overflow: hidden;
}

.tool-loading::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--grad-tool);
  animation: toolLoading 1.5s ease-in-out infinite;
}

/* Code Blocks in Messages */
.message pre {
  background: color-mix(in srgb, var(--grad-primary-start) 3%, var(--vscode-textCodeBlock-background));
  border: 1px solid color-mix(in srgb, var(--grad-primary-start) 10%, var(--vscode-panel-border));
  border-radius: var(--radius-md);
  padding: var(--space-lg);
  margin: var(--space-md) 0;
  overflow-x: auto;
  position: relative;
}

.message code {
  background-color: var(--vscode-textCodeBlock-background);
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  font-family: var(--vscode-editor-font-family);
  font-size: 0.875em;
}

.message pre code {
  background: none;
  padding: 0;
  border-radius: 0;
}

/* Message Actions */
.message-actions {
  position: absolute;
  top: var(--space-sm);
  right: var(--space-sm);
  display: flex;
  gap: var(--space-xs);
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.message:hover .message-actions {
  opacity: 1;
}

/* Streaming Message Indicator */
.message.streaming::after {
  content: '●●●';
  display: inline-block;
  animation: blink 1.4s infinite;
  margin-left: var(--space-sm);
  font-size: var(--font-size-sm);
  color: var(--vscode-descriptionForeground);
}

/* Message Lists */
.message-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  padding-bottom: var(--space-xl);
}

/* Empty Messages State */
.messages-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: var(--vscode-descriptionForeground);
  padding: var(--space-2xl);
}

.messages-empty-icon {
  font-size: 48px;
  opacity: 0.3;
  margin-bottom: var(--space-lg);
}

.messages-empty-text {
  font-size: var(--font-size-md);
  margin-bottom: var(--space-md);
}

.messages-empty-hint {
  font-size: var(--font-size-sm);
  opacity: 0.8;
}

/* Thinking Indicator */
.thinking-indicator {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md);
  background: color-mix(in srgb, var(--grad-thinking) 10%, var(--vscode-editor-background));
  border-radius: var(--radius-md);
  margin-bottom: var(--space-md);
  animation: pulse 2s ease-in-out infinite;
}

.thinking-indicator-icon {
  width: 16px;
  height: 16px;
  border-radius: var(--radius-full);
  background: var(--grad-thinking);
  animation: spin 2s linear infinite;
}

.thinking-indicator-text {
  font-style: italic;
  color: var(--vscode-descriptionForeground);
}

/* Message Markdown Styles */
.message h1,
.message h2,
.message h3,
.message h4,
.message h5,
.message h6 {
  margin-top: var(--space-lg);
  margin-bottom: var(--space-md);
  font-weight: var(--font-weight-semibold);
}

.message p {
  margin-bottom: var(--space-md);
}

.message ul,
.message ol {
  margin-left: var(--space-xl);
  margin-bottom: var(--space-md);
}

.message ul {
  list-style-type: disc;
}

.message ol {
  list-style-type: decimal;
}

.message li {
  margin-bottom: var(--space-sm);
}

.message blockquote {
  border-left: 3px solid var(--vscode-textBlockQuote-border);
  padding-left: var(--space-lg);
  margin: var(--space-md) 0;
  color: var(--vscode-textBlockQuote-foreground);
  font-style: italic;
}

.message a {
  color: var(--vscode-textLink-foreground);
  text-decoration: underline;
}

.message a:hover {
  color: var(--vscode-textLink-activeForeground);
}

.message hr {
  border: none;
  border-top: 1px solid var(--vscode-panel-border);
  margin: var(--space-xl) 0;
}

/* Message Tables */
.message table {
  width: 100%;
  border-collapse: collapse;
  margin: var(--space-md) 0;
  font-size: var(--font-size-sm);
}

.message th,
.message td {
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--vscode-panel-border);
  text-align: left;
}

.message th {
  background-color: var(--vscode-editor-selectionBackground);
  font-weight: var(--font-weight-medium);
}

.message tr:nth-child(even) {
  background-color: color-mix(in srgb, var(--vscode-editor-background) 95%, var(--vscode-editor-foreground));
}

/* Responsive Message Layout */
@media (max-width: 768px) {
  .message.user {
    margin-left: 0;
  }
  
  .message.claude,
  .message.assistant {
    margin-right: 0;
  }
  
  .message {
    padding: var(--space-md);
  }
}
`;