/**
 * File Picker Feature Styles
 * Styles for file selection, search, and directory browsing
 */

export const filePickerStyles = `
/* ===================================
 * File Picker Features
 * =================================== */

/* File Picker Container */
.file-picker-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: 500px;
}

/* File Search */
.file-search-container {
  padding: var(--space-lg);
  border-bottom: 1px solid var(--vscode-panel-border);
  flex-shrink: 0;
}

.file-search-input {
  width: 100%;
  padding: var(--space-md);
  padding-left: var(--space-3xl);
  background-color: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
  border-radius: var(--radius-md);
  font-size: var(--font-size-base);
  transition: all var(--transition-fast);
  background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg width='16' height='16' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z' fill='%23999999'/%3e%3c/svg%3e");
  background-repeat: no-repeat;
  background-position: var(--space-md) center;
  background-size: 16px;
}

.file-search-input:focus {
  outline: none;
  border-color: var(--vscode-focusBorder);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--grad-primary-mid) 20%, transparent);
}

.file-search-input::placeholder {
  color: var(--vscode-input-placeholderForeground);
}

/* File Search Results Info */
.file-search-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-sm) var(--space-lg);
  font-size: var(--font-size-sm);
  color: var(--vscode-descriptionForeground);
  background-color: var(--vscode-editor-background);
  border-bottom: 1px solid var(--vscode-panel-border);
}

.file-search-count {
  font-weight: var(--font-weight-medium);
}

.file-search-filter {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

/* File List */
.file-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: var(--space-sm);
}

.file-list::-webkit-scrollbar {
  width: 8px;
}

/* File Item */
.file-item {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  user-select: none;
  position: relative;
}

.file-item:hover {
  background: color-mix(in srgb, var(--grad-primary-start) 5%, var(--vscode-list-hoverBackground));
}

.file-item.selected {
  background-color: var(--vscode-list-activeSelectionBackground);
  color: var(--vscode-list-activeSelectionForeground);
}

.file-item.focused {
  outline: 2px solid var(--vscode-focusBorder);
  outline-offset: -2px;
}

/* File Icon */
.file-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}

.file-icon.folder {
  color: var(--vscode-symbolIcon-folderForeground);
}

.file-icon.file {
  color: var(--vscode-symbolIcon-fileForeground);
}

/* File type specific icons */
.file-icon.js,
.file-icon.ts {
  color: #f7df1e;
}

.file-icon.json {
  color: #fbc02d;
}

.file-icon.css,
.file-icon.scss {
  color: #1572b6;
}

.file-icon.html {
  color: #e34c26;
}

.file-icon.md {
  color: #4285f4;
}

.file-icon.py {
  color: #3776ab;
}

.file-icon.java {
  color: #007396;
}

.file-icon.cpp,
.file-icon.c {
  color: #00599c;
}

/* File Name */
.file-name {
  flex: 1;
  font-size: var(--font-size-sm);
  font-family: var(--vscode-editor-font-family);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-name-match {
  font-weight: var(--font-weight-semibold);
  color: var(--grad-primary-start);
  background: color-mix(in srgb, var(--grad-primary-start) 10%, transparent);
  padding: 0 2px;
  border-radius: 2px;
}

/* File Path */
.file-path {
  font-size: var(--font-size-xs);
  color: var(--vscode-descriptionForeground);
  opacity: 0.8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

/* File Info */
.file-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.file-size {
  font-size: var(--font-size-xs);
  color: var(--vscode-descriptionForeground);
  opacity: 0.7;
  margin-left: auto;
  flex-shrink: 0;
}

/* File Actions */
.file-actions {
  display: flex;
  gap: var(--space-xs);
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.file-item:hover .file-actions {
  opacity: 1;
}

.file-action-btn {
  padding: var(--space-xs);
  background: none;
  border: none;
  color: var(--vscode-foreground);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
  opacity: 0.7;
}

.file-action-btn:hover {
  opacity: 1;
  background-color: var(--color-hover-bg);
}

/* Breadcrumb Navigation */
.file-breadcrumb {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-lg);
  background-color: var(--vscode-breadcrumb-background);
  border-bottom: 1px solid var(--vscode-panel-border);
  font-size: var(--font-size-sm);
  overflow-x: auto;
  flex-shrink: 0;
}

.breadcrumb-item {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  color: var(--vscode-breadcrumb-foreground);
  cursor: pointer;
  transition: color var(--transition-fast);
  white-space: nowrap;
}

.breadcrumb-item:hover {
  color: var(--vscode-breadcrumb-focusForeground);
}

.breadcrumb-separator {
  color: var(--vscode-breadcrumb-foreground);
  opacity: 0.5;
}

/* File Tree View */
.file-tree {
  padding: var(--space-md);
}

.file-tree-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-xs) 0;
  cursor: pointer;
  user-select: none;
}

.file-tree-indent {
  width: var(--space-lg);
  flex-shrink: 0;
}

.file-tree-expand {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform var(--transition-fast);
}

.file-tree-expand.expanded {
  transform: rotate(90deg);
}

.file-tree-children {
  margin-left: var(--space-lg);
}

/* File Preview */
.file-preview {
  padding: var(--space-lg);
  background-color: var(--vscode-editor-background);
  border-top: 1px solid var(--vscode-panel-border);
  max-height: 200px;
  overflow-y: auto;
}

.file-preview-content {
  font-family: var(--vscode-editor-font-family);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-normal);
  white-space: pre-wrap;
  word-break: break-word;
}

.file-preview-image {
  max-width: 100%;
  height: auto;
  border-radius: var(--radius-md);
}

/* Empty State */
.file-picker-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: var(--space-2xl);
  text-align: center;
  color: var(--vscode-descriptionForeground);
}

.file-picker-empty-icon {
  font-size: 48px;
  opacity: 0.3;
  margin-bottom: var(--space-lg);
}

.file-picker-empty-text {
  font-size: var(--font-size-md);
  margin-bottom: var(--space-sm);
}

.file-picker-empty-hint {
  font-size: var(--font-size-sm);
  opacity: 0.8;
}

/* Loading State */
.file-picker-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: var(--space-2xl);
}

.file-picker-loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--vscode-progressBar-background);
  border-top-color: var(--grad-primary-start);
  border-radius: var(--radius-full);
  animation: spin 1s linear infinite;
}

/* File Filters */
.file-filters {
  display: flex;
  gap: var(--space-md);
  padding: var(--space-md) var(--space-lg);
  background-color: var(--vscode-editor-background);
  border-bottom: 1px solid var(--vscode-panel-border);
}

.file-filter-btn {
  padding: var(--space-xs) var(--space-md);
  background-color: transparent;
  color: var(--vscode-foreground);
  border: 1px solid var(--vscode-panel-border);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.file-filter-btn:hover {
  background-color: var(--color-hover-bg);
}

.file-filter-btn.active {
  background-color: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border-color: var(--vscode-button-background);
}

/* Recent Files Section */
.recent-files {
  padding: var(--space-lg);
  border-bottom: 1px solid var(--vscode-panel-border);
}

.recent-files-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--vscode-descriptionForeground);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--space-md);
}

.recent-file-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) 0;
  font-size: var(--font-size-sm);
  color: var(--vscode-foreground);
  cursor: pointer;
  transition: color var(--transition-fast);
}

.recent-file-item:hover {
  color: var(--vscode-textLink-activeForeground);
}

/* Multi-Select */
.file-item.multi-selected {
  background-color: color-mix(in srgb, var(--vscode-list-activeSelectionBackground) 50%, transparent);
}

.file-select-checkbox {
  width: 16px;
  height: 16px;
  margin-right: var(--space-sm);
  cursor: pointer;
}

.file-selection-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-sm) var(--space-lg);
  background-color: var(--vscode-notifications-background);
  color: var(--vscode-notifications-foreground);
  font-size: var(--font-size-sm);
}

.file-selection-count {
  font-weight: var(--font-weight-medium);
}

.file-selection-actions {
  display: flex;
  gap: var(--space-md);
}

/* Responsive File Picker */
@media (max-width: 768px) {
  .file-picker-container {
    max-height: 80vh;
  }
  
  .file-breadcrumb {
    padding: var(--space-sm) var(--space-md);
  }
  
  .file-item {
    padding: var(--space-sm);
  }
  
  .file-path {
    display: none;
  }
}
`;