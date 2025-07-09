/**
 * Diff Viewer Feature Styles
 * Styles for code diffs, file changes, and version comparisons
 */

export const diffStyles = `
/* ===================================
 * Diff Viewer Features
 * =================================== */

/* Diff Container */
.diff-container {
  background-color: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  margin: var(--space-md) 0;
}

/* Diff Header */
.diff-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md) var(--space-lg);
  background-color: var(--vscode-editor-selectionBackground);
  border-bottom: 1px solid var(--vscode-panel-border);
}

.diff-file-path {
  font-family: var(--vscode-editor-font-family);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--vscode-foreground);
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.diff-file-icon {
  width: 16px;
  height: 16px;
}

.diff-stats {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
  font-size: var(--font-size-sm);
}

.diff-stat {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.diff-additions {
  color: var(--vscode-gitDecoration-addedResourceForeground);
}

.diff-deletions {
  color: var(--vscode-gitDecoration-deletedResourceForeground);
}

/* Diff Content */
.diff-content {
  font-family: var(--vscode-editor-font-family);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-normal);
  overflow-x: auto;
}

/* Diff View Modes */
.diff-view-options {
  display: flex;
  gap: var(--space-xs);
}

.diff-view-btn {
  padding: var(--space-xs) var(--space-md);
  background-color: transparent;
  color: var(--vscode-foreground);
  border: 1px solid var(--vscode-panel-border);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.diff-view-btn:hover {
  background-color: var(--color-hover-bg);
}

.diff-view-btn.active {
  background-color: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border-color: var(--vscode-button-background);
}

/* Unified Diff View */
.diff-unified {
  width: 100%;
  border-collapse: collapse;
}

.diff-line {
  display: flex;
  min-height: 20px;
}

.diff-line-number {
  width: 40px;
  padding: 0 var(--space-sm);
  text-align: right;
  color: var(--vscode-editorLineNumber-foreground);
  background-color: var(--vscode-editorGutter-background);
  border-right: 1px solid var(--vscode-panel-border);
  user-select: none;
  flex-shrink: 0;
}

.diff-line-content {
  flex: 1;
  padding: 0 var(--space-md);
  white-space: pre;
  overflow-x: auto;
}

/* Diff Line Types */
.diff-line.added {
  background-color: var(--vscode-diffEditor-insertedTextBackground);
}

.diff-line.added .diff-line-content {
  color: var(--vscode-diffEditor-insertedTextForeground);
}

.diff-line.removed {
  background-color: var(--vscode-diffEditor-removedTextBackground);
}

.diff-line.removed .diff-line-content {
  color: var(--vscode-diffEditor-removedTextForeground);
  text-decoration: line-through;
  opacity: 0.8;
}

.diff-line.context {
  background-color: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
}

/* Diff Markers */
.diff-marker {
  width: 20px;
  text-align: center;
  font-weight: var(--font-weight-bold);
  user-select: none;
}

.diff-line.added .diff-marker {
  color: var(--vscode-gitDecoration-addedResourceForeground);
}

.diff-line.removed .diff-marker {
  color: var(--vscode-gitDecoration-deletedResourceForeground);
}

/* Split Diff View */
.diff-split {
  display: flex;
  overflow-x: auto;
}

.diff-side {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
}

.diff-side.left {
  border-right: 1px solid var(--vscode-panel-border);
}

.diff-side-header {
  padding: var(--space-sm) var(--space-md);
  background-color: var(--vscode-editor-selectionBackground);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  text-align: center;
  border-bottom: 1px solid var(--vscode-panel-border);
}

/* Inline Diff Highlighting */
.diff-highlight {
  background-color: var(--vscode-diffEditor-insertedTextBackground);
  border-radius: 2px;
  padding: 0 2px;
}

.diff-line.added .diff-highlight {
  background-color: color-mix(in srgb, var(--vscode-gitDecoration-addedResourceForeground) 30%, transparent);
}

.diff-line.removed .diff-highlight {
  background-color: color-mix(in srgb, var(--vscode-gitDecoration-deletedResourceForeground) 30%, transparent);
}

/* Expand/Collapse Sections */
.diff-expand {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-sm);
  background-color: var(--vscode-editor-foldBackground);
  border: 1px solid var(--vscode-panel-border);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.diff-expand:hover {
  background-color: var(--vscode-editor-hoverHighlightBackground);
}

.diff-expand-text {
  font-size: var(--font-size-sm);
  color: var(--vscode-descriptionForeground);
}

/* File Status Icons */
.diff-file-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  margin-right: var(--space-sm);
}

.diff-file-status.added {
  background-color: var(--vscode-gitDecoration-addedResourceForeground);
  color: white;
}

.diff-file-status.modified {
  background-color: var(--vscode-gitDecoration-modifiedResourceForeground);
  color: white;
}

.diff-file-status.deleted {
  background-color: var(--vscode-gitDecoration-deletedResourceForeground);
  color: white;
}

.diff-file-status.renamed {
  background-color: var(--vscode-gitDecoration-renamedResourceForeground);
  color: white;
}

/* Diff Summary */
.diff-summary {
  padding: var(--space-lg);
  background-color: var(--vscode-editor-background);
  border-top: 1px solid var(--vscode-panel-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.diff-summary-stats {
  display: flex;
  gap: var(--space-xl);
  font-size: var(--font-size-sm);
}

.diff-summary-actions {
  display: flex;
  gap: var(--space-md);
}

/* Syntax Highlighting in Diffs */
.diff-syntax {
  color: var(--vscode-editor-foreground);
}

.diff-syntax .keyword {
  color: var(--vscode-symbolIcon-keywordForeground);
  font-weight: var(--font-weight-medium);
}

.diff-syntax .string {
  color: var(--vscode-symbolIcon-stringForeground);
}

.diff-syntax .number {
  color: var(--vscode-symbolIcon-numberForeground);
}

.diff-syntax .comment {
  color: var(--vscode-editor-foreground);
  opacity: 0.6;
  font-style: italic;
}

.diff-syntax .function {
  color: var(--vscode-symbolIcon-functionForeground);
}

.diff-syntax .variable {
  color: var(--vscode-symbolIcon-variableForeground);
}

/* Diff Navigation */
.diff-navigation {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-sm) var(--space-md);
  background-color: var(--vscode-editor-background);
  border-bottom: 1px solid var(--vscode-panel-border);
}

.diff-nav-buttons {
  display: flex;
  gap: var(--space-sm);
}

.diff-nav-btn {
  padding: var(--space-xs) var(--space-md);
  background-color: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.diff-nav-btn:hover:not(:disabled) {
  background-color: var(--vscode-button-hoverBackground);
}

.diff-nav-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.diff-nav-info {
  font-size: var(--font-size-sm);
  color: var(--vscode-descriptionForeground);
}

/* Collapsed Diff */
.diff-collapsed {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md) var(--space-lg);
  background-color: var(--vscode-editor-background);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.diff-collapsed:hover {
  background-color: var(--vscode-editor-hoverHighlightBackground);
}

.diff-collapsed-info {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.diff-collapsed-stats {
  display: flex;
  gap: var(--space-md);
  font-size: var(--font-size-sm);
}

/* Diff Actions */
.diff-actions {
  display: flex;
  gap: var(--space-sm);
}

.diff-action-btn {
  padding: var(--space-xs);
  background: none;
  border: none;
  color: var(--vscode-foreground);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
  opacity: 0.7;
}

.diff-action-btn:hover {
  opacity: 1;
  background-color: var(--color-hover-bg);
}

/* Word-level Diff */
.diff-word-added {
  background-color: color-mix(in srgb, var(--vscode-gitDecoration-addedResourceForeground) 25%, transparent);
  border-bottom: 2px solid var(--vscode-gitDecoration-addedResourceForeground);
}

.diff-word-removed {
  background-color: color-mix(in srgb, var(--vscode-gitDecoration-deletedResourceForeground) 25%, transparent);
  border-bottom: 2px solid var(--vscode-gitDecoration-deletedResourceForeground);
  text-decoration: line-through;
}

/* Character-level Diff */
.diff-char-added {
  background-color: var(--vscode-gitDecoration-addedResourceForeground);
  color: white;
  border-radius: 2px;
  padding: 0 1px;
}

.diff-char-removed {
  background-color: var(--vscode-gitDecoration-deletedResourceForeground);
  color: white;
  border-radius: 2px;
  padding: 0 1px;
  text-decoration: line-through;
}

/* Responsive Diff Viewer */
@media (max-width: 768px) {
  .diff-split {
    flex-direction: column;
  }
  
  .diff-side.left {
    border-right: none;
    border-bottom: 1px solid var(--vscode-panel-border);
  }
  
  .diff-line-number {
    width: 30px;
    font-size: var(--font-size-xs);
  }
  
  .diff-stats {
    flex-direction: column;
    gap: var(--space-sm);
    align-items: flex-start;
  }
  
  .diff-summary {
    flex-direction: column;
    gap: var(--space-md);
  }
}
`;