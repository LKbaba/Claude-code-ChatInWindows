/**
 * Tool Feature Styles
 * Styles for tool execution, status display, and results
 */

export const toolStyles = `
/* ===================================
 * Tool Features
 * =================================== */

/* Tool Container */
.tool-container {
  margin: var(--space-md) 0;
  border: 1px solid var(--vscode-panel-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  background-color: var(--vscode-editor-background);
}

/* Tool Header */
.tool-header {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md) var(--space-lg);
  background: color-mix(in srgb, var(--grad-tool) 5%, var(--vscode-editor-background));
  border-bottom: 1px solid var(--vscode-panel-border);
  cursor: pointer;
  transition: all var(--transition-fast);
  user-select: none;
}

.tool-header:hover {
  background: color-mix(in srgb, var(--grad-tool) 10%, var(--vscode-editor-background));
}

.tool-header.collapsed {
  border-bottom: none;
}

/* Tool Icon */
.tool-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--grad-tool);
  color: white;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  flex-shrink: 0;
}

/* Tool Info */
.tool-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  min-width: 0;
}

.tool-name {
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-base);
  color: var(--vscode-foreground);
}

.tool-description {
  font-size: var(--font-size-sm);
  color: var(--vscode-descriptionForeground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Tool Status */
.tool-status {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--font-size-sm);
}

.tool-status-indicator {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

.tool-status.pending .tool-status-indicator {
  background-color: var(--vscode-editorWarning-foreground);
  animation: pulse 2s ease-in-out infinite;
}

.tool-status.running .tool-status-indicator {
  background-color: var(--vscode-testing-iconQueued);
  animation: pulse 1s ease-in-out infinite;
}

.tool-status.success .tool-status-indicator {
  background-color: var(--vscode-testing-iconPassed);
}

.tool-status.error .tool-status-indicator {
  background-color: var(--vscode-testing-iconFailed);
}

.tool-status-text {
  color: var(--vscode-descriptionForeground);
  text-transform: capitalize;
}

/* Tool Execution Time */
.tool-execution-time {
  font-size: var(--font-size-xs);
  color: var(--vscode-descriptionForeground);
  opacity: 0.8;
}

/* Tool Content */
.tool-content {
  padding: var(--space-lg);
  background-color: var(--vscode-editor-background);
  max-height: 0;
  overflow: hidden;
  transition: max-height var(--transition-normal) ease-out;
}

.tool-container.expanded .tool-content {
  max-height: 2000px;
}

/* Tool Sections */
.tool-section {
  margin-bottom: var(--space-lg);
}

.tool-section:last-child {
  margin-bottom: 0;
}

.tool-section-label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--vscode-descriptionForeground);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--space-sm);
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

/* Tool Input Display */
.tool-input {
  background-color: var(--vscode-textCodeBlock-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  font-family: var(--vscode-editor-font-family);
  font-size: var(--font-size-sm);
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.tool-input.json {
  white-space: pre;
}

/* Tool Output Display */
.tool-output {
  background-color: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  font-family: var(--vscode-editor-font-family);
  font-size: var(--font-size-sm);
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  position: relative;
}

.tool-output.error {
  background-color: var(--vscode-inputValidation-errorBackground);
  border-color: var(--vscode-inputValidation-errorBorder);
  color: var(--vscode-errorForeground);
}

.tool-output.truncated::after {
  content: "... (output truncated)";
  display: block;
  margin-top: var(--space-md);
  font-style: italic;
  opacity: 0.7;
  text-align: center;
}

/* Tool Status Bar */
.tool-status-bar {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
  padding: var(--space-sm) var(--space-lg);
  background-color: var(--vscode-editor-selectionBackground);
  border-top: 1px solid var(--vscode-panel-border);
  font-size: var(--font-size-xs);
  color: var(--vscode-descriptionForeground);
}

.tool-status-bar-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

/* Tool Loading Animation */
.tool-loading {
  position: relative;
  overflow: hidden;
}

.tool-loading::before {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--grad-tool) 50%,
    transparent 100%
  );
  animation: toolLoading 1.5s ease-in-out infinite;
}

/* Tool Actions */
.tool-actions {
  display: flex;
  gap: var(--space-sm);
  margin-top: var(--space-md);
}

.tool-action-btn {
  padding: var(--space-xs) var(--space-md);
  background-color: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.tool-action-btn:hover {
  background-color: var(--vscode-button-hoverBackground);
}

/* Expand/Collapse Arrow */
.tool-expand-arrow {
  width: 16px;
  height: 16px;
  margin-left: auto;
  transition: transform var(--transition-fast);
  color: var(--vscode-descriptionForeground);
}

.tool-container.expanded .tool-expand-arrow {
  transform: rotate(180deg);
}

/* Tool Result Summary */
.tool-result-summary {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md);
  background: color-mix(in srgb, var(--grad-success) 5%, var(--vscode-editor-background));
  border: 1px solid color-mix(in srgb, var(--grad-success) 20%, var(--vscode-panel-border));
  border-radius: var(--radius-md);
  margin-top: var(--space-md);
}

.tool-result-summary.error {
  background: color-mix(in srgb, var(--grad-error) 5%, var(--vscode-editor-background));
  border-color: color-mix(in srgb, var(--grad-error) 20%, var(--vscode-panel-border));
}

.tool-result-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

.tool-result-summary.success .tool-result-icon {
  background: var(--grad-success);
  color: white;
}

.tool-result-summary.error .tool-result-icon {
  background: var(--grad-error);
  color: white;
}

/* Tool Grid Display */
.tool-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: var(--space-md);
  margin-top: var(--space-md);
}

.tool-grid-item {
  padding: var(--space-md);
  background-color: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: var(--radius-md);
  transition: all var(--transition-fast);
}

.tool-grid-item:hover {
  border-color: var(--grad-tool);
  box-shadow: var(--shadow-sm);
}

/* Tool Progress Bar */
.tool-progress {
  margin-top: var(--space-md);
  height: 4px;
  background-color: var(--vscode-progressBar-background);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.tool-progress-bar {
  height: 100%;
  background: var(--grad-tool);
  transition: width var(--transition-normal) ease-out;
}

/* Inline Tool Display */
.tool-inline {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  background: color-mix(in srgb, var(--grad-tool) 10%, var(--vscode-editor-background));
  border: 1px solid color-mix(in srgb, var(--grad-tool) 30%, var(--vscode-panel-border));
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  font-family: var(--vscode-editor-font-family);
}

.tool-inline-icon {
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--grad-tool);
  color: white;
  border-radius: var(--radius-xs);
  font-size: 10px;
}

/* Tool Chain Display */
.tool-chain {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  margin: var(--space-lg) 0;
  padding: var(--space-md);
  background-color: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: var(--radius-md);
  overflow-x: auto;
}

.tool-chain-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-shrink: 0;
}

.tool-chain-arrow {
  color: var(--vscode-descriptionForeground);
  opacity: 0.5;
}

/* Tool Error Details */
.tool-error-details {
  margin-top: var(--space-md);
  padding: var(--space-md);
  background-color: var(--vscode-inputValidation-errorBackground);
  border: 1px solid var(--vscode-inputValidation-errorBorder);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
}

.tool-error-stack {
  margin-top: var(--space-sm);
  padding: var(--space-sm);
  background-color: rgba(0, 0, 0, 0.1);
  border-radius: var(--radius-sm);
  font-family: var(--vscode-editor-font-family);
  font-size: var(--font-size-xs);
  overflow-x: auto;
  white-space: pre;
}

/* Responsive Tool Styles */
@media (max-width: 768px) {
  .tool-header {
    padding: var(--space-sm) var(--space-md);
  }
  
  .tool-content {
    padding: var(--space-md);
  }
  
  .tool-grid {
    grid-template-columns: 1fr;
  }
  
  .tool-chain {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .tool-chain-arrow {
    transform: rotate(90deg);
  }
}
`;