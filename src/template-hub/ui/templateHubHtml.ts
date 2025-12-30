/**
 * Template Hub HTML Generator
 * 生成 Template Hub 的 Webview HTML 内容
 */

import * as vscode from 'vscode';

/**
 * 生成 Template Hub 的 HTML 内容
 */
export function getTemplateHubHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline';">
    <title>Template Hub</title>
    ${getStyles()}
</head>
<body>
    <div class="template-hub">
        ${getHeader()}
        ${getSearchBar()}
        ${getCategoryTabs()}
        ${getTemplateList()}
        ${getPreviewPanel()}
        ${getCreateTemplateDialog()}
        ${getDeployDialog()}
    </div>
    <script>${getScript()}</script>
</body>
</html>`;
}

/**
 * 获取样式
 */
function getStyles(): string {
  return `<style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--vscode-font-family);
      background-color: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-size: 13px;
      line-height: 1.4;
      height: 100vh;
      overflow: hidden;
    }

    .template-hub {
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }

    /* Header */
    .hub-header {
      padding: 12px 16px;
      border-bottom: 1px solid var(--vscode-panel-border);
      background-color: var(--vscode-panel-background);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
    }

    .hub-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--vscode-foreground);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .hub-title-icon {
      font-size: 16px;
    }

    .hub-actions {
      display: flex;
      gap: 8px;
    }

    /* Buttons */
    .btn {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .btn:hover {
      background-color: var(--vscode-button-hoverBackground);
    }

    .btn.secondary {
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .btn.secondary:hover {
      background-color: var(--vscode-button-secondaryHoverBackground);
    }

    .btn.small {
      padding: 4px 8px;
      font-size: 11px;
    }

    .btn.icon-only {
      padding: 6px;
      min-width: 28px;
      justify-content: center;
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Search Bar */
    .search-container {
      padding: 12px 16px;
      border-bottom: 1px solid var(--vscode-panel-border);
      flex-shrink: 0;
    }

    .search-input-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }

    .search-icon {
      position: absolute;
      left: 10px;
      color: var(--vscode-descriptionForeground);
      font-size: 14px;
    }

    .search-input {
      width: 100%;
      padding: 8px 12px 8px 32px;
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      font-size: 13px;
      outline: none;
    }

    .search-input:focus {
      border-color: var(--vscode-focusBorder);
    }

    .search-input::placeholder {
      color: var(--vscode-input-placeholderForeground);
    }

    /* Category Tabs */
    .category-tabs {
      display: flex;
      padding: 8px 16px;
      gap: 4px;
      border-bottom: 1px solid var(--vscode-panel-border);
      flex-shrink: 0;
      overflow-x: auto;
    }

    .category-tab {
      padding: 6px 12px;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 4px;
      color: var(--vscode-descriptionForeground);
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      transition: all 0.2s ease;
      white-space: nowrap;
    }

    .category-tab:hover {
      background-color: var(--vscode-list-hoverBackground);
      color: var(--vscode-foreground);
    }

    .category-tab.active {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-color: var(--vscode-button-background);
    }

    .category-count {
      margin-left: 4px;
      padding: 1px 6px;
      background-color: rgba(255, 255, 255, 0.1);
      border-radius: 10px;
      font-size: 10px;
    }

    /* Template List */
    .template-list-container {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }

    .template-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .template-item {
      padding: 12px;
      background-color: var(--vscode-list-inactiveSelectionBackground);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .template-item:hover {
      background-color: var(--vscode-list-hoverBackground);
      border-color: var(--vscode-focusBorder);
    }

    .template-item.selected {
      background-color: var(--vscode-list-activeSelectionBackground);
      border-color: var(--vscode-focusBorder);
    }

    .template-item-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 6px;
    }

    .template-name {
      font-weight: 600;
      font-size: 13px;
      color: var(--vscode-foreground);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .template-source-badge {
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 500;
      text-transform: uppercase;
    }

    .template-source-badge.built-in {
      background-color: rgba(46, 204, 113, 0.15);
      color: #2ecc71;
    }

    .template-source-badge.user {
      background-color: rgba(64, 165, 255, 0.15);
      color: #40a5ff;
    }

    .template-source-badge.imported {
      background-color: rgba(155, 89, 182, 0.15);
      color: #9b59b6;
    }

    .template-category-icon {
      font-size: 14px;
    }

    .template-description {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 8px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .template-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }

    .template-tag {
      padding: 2px 6px;
      background-color: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 3px;
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
    }

    .template-checkbox {
      width: 16px;
      height: 16px;
      cursor: pointer;
      accent-color: var(--vscode-button-background);
    }

    /* Empty State */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
      text-align: center;
      color: var(--vscode-descriptionForeground);
    }

    .empty-state-icon {
      font-size: 48px;
      margin-bottom: 16px;
      opacity: 0.5;
    }

    .empty-state-title {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--vscode-foreground);
    }

    .empty-state-description {
      font-size: 12px;
      max-width: 300px;
    }

    /* Preview Panel */
    .preview-panel {
      display: none;
      position: fixed;
      top: 0;
      right: 0;
      width: 50%;
      height: 100%;
      background-color: var(--vscode-editor-background);
      border-left: 1px solid var(--vscode-panel-border);
      z-index: 100;
      flex-direction: column;
    }

    .preview-panel.visible {
      display: flex;
    }

    .preview-header {
      padding: 12px 16px;
      border-bottom: 1px solid var(--vscode-panel-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
    }

    .preview-title {
      font-weight: 600;
      font-size: 14px;
    }

    .preview-content {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    }

    .preview-meta {
      margin-bottom: 16px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .preview-meta-item {
      display: flex;
      margin-bottom: 8px;
      font-size: 12px;
    }

    .preview-meta-label {
      width: 80px;
      color: var(--vscode-descriptionForeground);
      flex-shrink: 0;
    }

    .preview-meta-value {
      color: var(--vscode-foreground);
    }

    .preview-code {
      background-color: var(--vscode-textCodeBlock-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 12px;
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      line-height: 1.5;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .preview-actions {
      padding: 12px 16px;
      border-top: 1px solid var(--vscode-panel-border);
      display: flex;
      gap: 8px;
      flex-shrink: 0;
    }

    /* Dialogs */
    .dialog-overlay {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(0, 0, 0, 0.5);
      z-index: 200;
      align-items: center;
      justify-content: center;
    }

    .dialog-overlay.visible {
      display: flex;
    }

    .dialog {
      background-color: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      width: 90%;
      max-width: 500px;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    }

    .dialog-header {
      padding: 16px;
      border-bottom: 1px solid var(--vscode-panel-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .dialog-title {
      font-weight: 600;
      font-size: 14px;
    }

    .dialog-close {
      background: transparent;
      border: none;
      color: var(--vscode-descriptionForeground);
      cursor: pointer;
      font-size: 18px;
      padding: 4px;
      line-height: 1;
    }

    .dialog-close:hover {
      color: var(--vscode-foreground);
    }

    .dialog-content {
      padding: 16px;
      overflow-y: auto;
      flex: 1;
    }

    .dialog-footer {
      padding: 16px;
      border-top: 1px solid var(--vscode-panel-border);
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    /* Form Elements */
    .form-group {
      margin-bottom: 16px;
    }

    .form-label {
      display: block;
      margin-bottom: 6px;
      font-size: 12px;
      font-weight: 500;
      color: var(--vscode-foreground);
    }

    .form-input,
    .form-select,
    .form-textarea {
      width: 100%;
      padding: 8px 12px;
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      font-size: 13px;
      font-family: inherit;
      outline: none;
    }

    .form-input:focus,
    .form-select:focus,
    .form-textarea:focus {
      border-color: var(--vscode-focusBorder);
    }

    .form-textarea {
      min-height: 150px;
      resize: vertical;
      font-family: var(--vscode-editor-font-family);
    }

    .form-hint {
      margin-top: 4px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    /* Deploy Dialog */
    .deploy-summary {
      margin-bottom: 16px;
    }

    .deploy-template-list {
      max-height: 200px;
      overflow-y: auto;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
    }

    .deploy-template-item {
      padding: 8px 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .deploy-template-item:last-child {
      border-bottom: none;
    }

    .deploy-options {
      margin-top: 16px;
    }

    .deploy-option {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      font-size: 12px;
    }

    .deploy-option input[type="checkbox"] {
      accent-color: var(--vscode-button-background);
    }

    /* Loading State */
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px;
    }

    .loading-spinner {
      width: 24px;
      height: 24px;
      border: 2px solid var(--vscode-panel-border);
      border-top-color: var(--vscode-button-background);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Toast Notifications */
    .toast-container {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 300;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .toast {
      padding: 12px 16px;
      background-color: var(--vscode-notifications-background);
      border: 1px solid var(--vscode-notifications-border);
      border-radius: 4px;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      animation: slideIn 0.3s ease;
      max-width: 300px;
    }

    .toast.success {
      border-left: 3px solid #2ecc71;
    }

    .toast.error {
      border-left: 3px solid #e74c3c;
    }

    .toast.info {
      border-left: 3px solid #40a5ff;
    }

    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    /* Scrollbar */
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }

    ::-webkit-scrollbar-track {
      background: transparent;
    }

    ::-webkit-scrollbar-thumb {
      background-color: var(--vscode-scrollbarSlider-background);
      border-radius: 4px;
    }

    ::-webkit-scrollbar-thumb:hover {
      background-color: var(--vscode-scrollbarSlider-hoverBackground);
    }

    /* Wizard Dialog Styles */
    .wizard-dialog {
      max-width: 600px;
      min-height: 500px;
    }

    .wizard-steps {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px 0;
      margin-bottom: 16px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .wizard-step {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      opacity: 0.5;
      transition: opacity 0.3s ease;
    }

    .wizard-step.active {
      opacity: 1;
    }

    .wizard-step.completed {
      opacity: 1;
    }

    .wizard-step-number {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 14px;
      transition: all 0.3s ease;
    }

    .wizard-step.active .wizard-step-number {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .wizard-step.completed .wizard-step-number {
      background-color: #2ecc71;
      color: white;
    }

    .wizard-step.completed .wizard-step-number::after {
      content: '✓';
    }

    .wizard-step-label {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    .wizard-step.active .wizard-step-label {
      color: var(--vscode-foreground);
      font-weight: 500;
    }

    .wizard-step-connector {
      width: 60px;
      height: 2px;
      background-color: var(--vscode-panel-border);
      margin: 0 12px;
      margin-bottom: 20px;
    }

    .wizard-content {
      min-height: 300px;
    }

    .wizard-content.hidden {
      display: none;
    }

    .wizard-section {
      margin-bottom: 20px;
    }

    .wizard-section-title {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 12px;
      color: var(--vscode-foreground);
    }

    .wizard-description {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 12px;
    }

    /* Project Info */
    .project-info {
      background-color: var(--vscode-textCodeBlock-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 16px;
    }

    .project-info-item {
      display: flex;
      margin-bottom: 12px;
    }

    .project-info-item:last-child {
      margin-bottom: 0;
    }

    .project-info-label {
      width: 120px;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      flex-shrink: 0;
    }

    .project-info-value {
      font-size: 12px;
      color: var(--vscode-foreground);
      font-weight: 500;
    }

    .project-type-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
    }

    .framework-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .framework-tag {
      padding: 3px 8px;
      background-color: rgba(64, 165, 255, 0.15);
      color: #40a5ff;
      border-radius: 4px;
      font-size: 11px;
    }

    .language-tag {
      padding: 3px 8px;
      background-color: rgba(155, 89, 182, 0.15);
      color: #9b59b6;
      border-radius: 4px;
      font-size: 11px;
    }

    .config-status {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .config-status.exists {
      color: #2ecc71;
    }

    .config-status.not-exists {
      color: var(--vscode-descriptionForeground);
    }

    /* Quick Setup Button */
    .quick-setup-btn {
      width: 100%;
      padding: 12px 16px;
      font-size: 14px;
      justify-content: center;
    }

    /* Wizard Template List */
    .wizard-template-list {
      max-height: 250px;
      overflow-y: auto;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
    }

    .wizard-template-item {
      display: flex;
      align-items: center;
      padding: 10px 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
      cursor: pointer;
      transition: background-color 0.2s ease;
    }

    .wizard-template-item:last-child {
      border-bottom: none;
    }

    .wizard-template-item:hover {
      background-color: var(--vscode-list-hoverBackground);
    }

    .wizard-template-item.selected {
      background-color: var(--vscode-list-activeSelectionBackground);
    }

    .wizard-template-checkbox {
      margin-right: 10px;
      accent-color: var(--vscode-button-background);
    }

    .wizard-template-icon {
      margin-right: 8px;
      font-size: 14px;
    }

    .wizard-template-info {
      flex: 1;
      min-width: 0;
    }

    .wizard-template-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--vscode-foreground);
      margin-bottom: 2px;
    }

    .wizard-template-desc {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .wizard-template-category {
      font-size: 10px;
      padding: 2px 6px;
      background-color: rgba(255, 255, 255, 0.1);
      border-radius: 3px;
      color: var(--vscode-descriptionForeground);
      margin-left: 8px;
    }

    .wizard-select-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }

    /* Wizard Summary */
    .wizard-summary {
      background-color: var(--vscode-textCodeBlock-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 16px;
    }

    .wizard-summary-section {
      margin-bottom: 16px;
    }

    .wizard-summary-section:last-child {
      margin-bottom: 0;
    }

    .wizard-summary-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--vscode-foreground);
      margin-bottom: 8px;
    }

    .wizard-summary-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .wizard-summary-list li {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
      font-size: 12px;
      color: var(--vscode-foreground);
    }

    .wizard-summary-list li .icon {
      font-size: 14px;
    }

    .wizard-summary-success {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 20px;
      text-align: center;
    }

    .wizard-summary-success-icon {
      font-size: 48px;
      margin-bottom: 12px;
    }

    .wizard-summary-success-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--vscode-foreground);
      margin-bottom: 8px;
    }

    .wizard-summary-success-desc {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    /* Wizard Footer */
    .wizard-footer {
      display: flex;
      align-items: center;
    }

    .wizard-footer-spacer {
      flex: 1;
    }

    /* Empty Wizard Template List */
    .wizard-empty-state {
      padding: 30px 20px;
      text-align: center;
      color: var(--vscode-descriptionForeground);
    }

    .wizard-empty-state-icon {
      font-size: 32px;
      margin-bottom: 12px;
      opacity: 0.5;
    }

    .wizard-empty-state-text {
      font-size: 12px;
    }
  </style>`;
}

/**
 * 获取头部 HTML
 */
function getHeader(): string {
  return `
    <div class="hub-header">
      <div class="hub-title">
        <span class="hub-title-icon">📦</span>
        Template Hub
      </div>
      <div class="hub-actions">
        <button class="btn small secondary" onclick="openInitWizard()" title="Initialize Claude Code">
          <span>🚀</span> Init
        </button>
        <button class="btn small secondary" onclick="syncToClaudeMd()" title="Sync templates to CLAUDE.md">
          <span>🔄</span> Sync
        </button>
        <button class="btn small secondary" onclick="importTemplates()" title="Import Templates">
          <span>📥</span> Import
        </button>
        <button class="btn small secondary" onclick="showCreateDialog()" title="Create Template">
          <span>➕</span> New
        </button>
        <button class="btn small" onclick="deploySelected()" id="deployBtn" disabled title="Deploy Selected">
          <span>🚀</span> Deploy
        </button>
      </div>
    </div>`;
}

/**
 * 获取搜索栏 HTML
 */
function getSearchBar(): string {
  return `
    <div class="search-container">
      <div class="search-input-wrapper">
        <span class="search-icon">🔍</span>
        <input type="text" class="search-input" id="searchInput" placeholder="Search templates..." oninput="handleSearch(this.value)">
      </div>
    </div>`;
}

/**
 * 获取分类标签 HTML
 */
function getCategoryTabs(): string {
  return `
    <div class="category-tabs">
      <button class="category-tab active" data-category="all" onclick="filterByCategory('all')">
        All <span class="category-count" id="countAll">0</span>
      </button>
      <button class="category-tab" data-category="skill" onclick="filterByCategory('skill')">
        🎯 Skills <span class="category-count" id="countSkill">0</span>
      </button>
      <button class="category-tab" data-category="command" onclick="filterByCategory('command')">
        ⚡ Commands <span class="category-count" id="countCommand">0</span>
      </button>
      <button class="category-tab" data-category="hook" onclick="filterByCategory('hook')">
        🔗 Hooks <span class="category-count" id="countHook">0</span>
      </button>
      <button class="category-tab" data-category="agent" onclick="filterByCategory('agent')">
        🤖 Agents <span class="category-count" id="countAgent">0</span>
      </button>
    </div>`;
}

/**
 * 获取模板列表 HTML
 */
function getTemplateList(): string {
  return `
    <div class="template-list-container">
      <div class="template-list" id="templateList">
        <div class="loading">
          <div class="loading-spinner"></div>
        </div>
      </div>
    </div>`;
}

/**
 * 获取预览面板 HTML
 */
function getPreviewPanel(): string {
  return `
    <div class="preview-panel" id="previewPanel">
      <div class="preview-header">
        <span class="preview-title" id="previewTitle">Template Preview</span>
        <button class="dialog-close" onclick="closePreview()">×</button>
      </div>
      <div class="preview-content">
        <div class="preview-meta" id="previewMeta"></div>
        <pre class="preview-code" id="previewCode"></pre>
      </div>
      <div class="preview-actions">
        <button class="btn secondary" onclick="closePreview()">Close</button>
        <button class="btn" onclick="deployPreviewTemplate()" id="deployPreviewBtn">Deploy</button>
      </div>
    </div>`;
}

/**
 * 获取创建模板对话框 HTML
 */
function getCreateTemplateDialog(): string {
  return `
    <div class="dialog-overlay" id="createDialog">
      <div class="dialog">
        <div class="dialog-header">
          <span class="dialog-title">Create New Template</span>
          <button class="dialog-close" onclick="closeCreateDialog()">×</button>
        </div>
        <div class="dialog-content">
          <div class="form-group">
            <label class="form-label">Name *</label>
            <input type="text" class="form-input" id="templateName" placeholder="e.g., my-custom-skill">
          </div>
          <div class="form-group">
            <label class="form-label">Category *</label>
            <select class="form-select" id="templateCategory">
              <option value="skill">🎯 Skill</option>
              <option value="command">⚡ Command</option>
              <option value="hook">🔗 Hook</option>
              <option value="agent">🤖 Agent</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Description</label>
            <input type="text" class="form-input" id="templateDescription" placeholder="Brief description of the template">
          </div>
          <div class="form-group">
            <label class="form-label">Tags</label>
            <input type="text" class="form-input" id="templateTags" placeholder="Comma-separated tags, e.g., testing, react">
            <span class="form-hint">Separate multiple tags with commas</span>
          </div>
          <div class="form-group">
            <label class="form-label">Content *</label>
            <textarea class="form-textarea" id="templateContent" placeholder="Enter template content..."></textarea>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn secondary" onclick="closeCreateDialog()">Cancel</button>
          <button class="btn" onclick="createTemplate()">Create</button>
        </div>
      </div>
    </div>`;
}

/**
 * 获取部署对话框 HTML
 */
function getDeployDialog(): string {
  return `
    <div class="dialog-overlay" id="deployDialog">
      <div class="dialog">
        <div class="dialog-header">
          <span class="dialog-title">Deploy Templates</span>
          <button class="dialog-close" onclick="closeDeployDialog()">×</button>
        </div>
        <div class="dialog-content">
          <div class="deploy-summary">
            <p>The following templates will be deployed to your project's <code>.claude/</code> directory:</p>
          </div>
          <div class="deploy-template-list" id="deployTemplateList"></div>
          <div class="deploy-options">
            <label class="deploy-option">
              <input type="checkbox" id="overwriteExisting">
              Overwrite existing files
            </label>
            <label class="deploy-option">
              <input type="checkbox" id="createBackup" checked>
              Create backup of existing files
            </label>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn secondary" onclick="closeDeployDialog()">Cancel</button>
          <button class="btn" onclick="confirmDeploy()">Deploy</button>
        </div>
      </div>
    </div>
    ${getInitWizardDialog()}
    <div class="toast-container" id="toastContainer"></div>`;
}

/**
 * 获取初始化向导对话框 HTML
 */
function getInitWizardDialog(): string {
  return `
    <div class="dialog-overlay" id="initWizardDialog">
      <div class="dialog wizard-dialog">
        <div class="dialog-header">
          <span class="dialog-title">🚀 Initialize Claude Code</span>
          <button class="dialog-close" onclick="closeInitWizard()">×</button>
        </div>
        <div class="dialog-content">
          <!-- Wizard Steps Indicator -->
          <div class="wizard-steps">
            <div class="wizard-step active" data-step="1">
              <div class="wizard-step-number">1</div>
              <div class="wizard-step-label">Detect</div>
            </div>
            <div class="wizard-step-connector"></div>
            <div class="wizard-step" data-step="2">
              <div class="wizard-step-number">2</div>
              <div class="wizard-step-label">Select</div>
            </div>
            <div class="wizard-step-connector"></div>
            <div class="wizard-step" data-step="3">
              <div class="wizard-step-number">3</div>
              <div class="wizard-step-label">Deploy</div>
            </div>
          </div>

          <!-- Step 1: Project Detection -->
          <div class="wizard-content" id="wizardStep1">
            <div class="wizard-section">
              <h3 class="wizard-section-title">📊 Project Analysis</h3>
              <div class="project-info" id="projectInfo">
                <div class="loading">
                  <div class="loading-spinner"></div>
                </div>
              </div>
            </div>
            <div class="wizard-section">
              <h3 class="wizard-section-title">⚡ Quick Setup</h3>
              <p class="wizard-description">Deploy recommended templates automatically based on your project type.</p>
              <button class="btn quick-setup-btn" onclick="quickSetup()">
                <span>🎯</span> Quick Setup (Recommended)
              </button>
            </div>
          </div>

          <!-- Step 2: Template Selection -->
          <div class="wizard-content hidden" id="wizardStep2">
            <div class="wizard-section">
              <h3 class="wizard-section-title">📦 Recommended Templates</h3>
              <p class="wizard-description">Select templates to deploy to your project.</p>
              <div class="wizard-template-list" id="wizardTemplateList"></div>
            </div>
            <div class="wizard-section">
              <div class="wizard-select-actions">
                <button class="btn small secondary" onclick="selectAllWizardTemplates()">Select All</button>
                <button class="btn small secondary" onclick="deselectAllWizardTemplates()">Deselect All</button>
              </div>
            </div>
          </div>

          <!-- Step 3: Deployment Summary -->
          <div class="wizard-content hidden" id="wizardStep3">
            <div class="wizard-section">
              <h3 class="wizard-section-title">✅ Deployment Summary</h3>
              <div class="wizard-summary" id="wizardSummary">
                <div class="loading">
                  <div class="loading-spinner"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="dialog-footer wizard-footer">
          <button class="btn secondary" id="wizardBackBtn" onclick="wizardBack()" style="display: none;">Back</button>
          <div class="wizard-footer-spacer"></div>
          <button class="btn secondary" onclick="closeInitWizard()">Cancel</button>
          <button class="btn" id="wizardNextBtn" onclick="wizardNext()">Next</button>
        </div>
      </div>
    </div>`;
}


/**
 * 获取 Webview 脚本
 */
function getScript(): string {
  return `
    // VS Code API
    const vscode = acquireVsCodeApi();

    // State
    let templates = [];
    let selectedTemplates = new Set();
    let currentCategory = 'all';
    let currentPreviewTemplate = null;
    let searchQuery = '';

    // Category icons
    const categoryIcons = {
      skill: '🎯',
      command: '⚡',
      hook: '🔗',
      agent: '🤖'
    };

    // Initialize
    document.addEventListener('DOMContentLoaded', () => {
      // Request initial template list
      vscode.postMessage({ type: 'getTemplates' });
    });

    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;
      
      switch (message.type) {
        case 'templateList':
          templates = message.data;
          renderTemplateList();
          updateCategoryCounts();
          // Also update wizard templates if wizard is open
          if (wizardProjectAnalysis && wizardRecommendedTemplates.length === 0) {
            loadWizardTemplates(wizardProjectAnalysis.recommendedTemplates);
          }
          break;
          
        case 'templatePreview':
          showPreview(message.data);
          break;
          
        case 'deployResult':
          handleDeployResult(message.data);
          break;
          
        case 'operationResult':
          showToast(message.message, message.success ? 'success' : 'error');
          if (message.success) {
            closeCreateDialog();
            closeDeployDialog();
          }
          break;
          
        case 'initWizardData':
          handleInitWizardData(message.data);
          break;
          
        case 'wizardDeployResult':
          handleWizardDeployResult(message.data);
          break;
          
        case 'syncToClaudeMdResult':
          handleSyncResult(message.data);
          break;
          
        case 'error':
          showToast(message.message, 'error');
          break;
      }
    });

    // Render template list
    function renderTemplateList() {
      const container = document.getElementById('templateList');
      
      // Filter templates
      let filtered = templates;
      
      if (currentCategory !== 'all') {
        filtered = filtered.filter(t => t.category === currentCategory);
      }
      
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(t => 
          t.name.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query) ||
          t.tags.some(tag => tag.toLowerCase().includes(query))
        );
      }
      
      if (filtered.length === 0) {
        container.innerHTML = getEmptyState();
        return;
      }
      
      container.innerHTML = filtered.map(template => getTemplateItemHtml(template)).join('');
    }

    // Get template item HTML
    function getTemplateItemHtml(template) {
      const isSelected = selectedTemplates.has(template.id);
      const icon = categoryIcons[template.category] || '📄';
      const sourceClass = template.source.replace('-', '');
      
      return \`
        <div class="template-item \${isSelected ? 'selected' : ''}" 
             onclick="toggleTemplateSelection('\${template.id}')"
             ondblclick="showTemplatePreview('\${template.id}')">
          <div class="template-item-header">
            <div class="template-name">
              <span class="template-category-icon">\${icon}</span>
              \${escapeHtml(template.name)}
              <span class="template-source-badge \${sourceClass}">\${template.source}</span>
            </div>
            <input type="checkbox" class="template-checkbox" 
                   \${isSelected ? 'checked' : ''} 
                   onclick="event.stopPropagation(); toggleTemplateSelection('\${template.id}')">
          </div>
          <div class="template-description">\${escapeHtml(template.description)}</div>
          <div class="template-tags">
            \${template.tags.map(tag => \`<span class="template-tag">\${escapeHtml(tag)}</span>\`).join('')}
          </div>
        </div>
      \`;
    }

    // Get empty state HTML
    function getEmptyState() {
      if (searchQuery) {
        return \`
          <div class="empty-state">
            <div class="empty-state-icon">🔍</div>
            <div class="empty-state-title">No templates found</div>
            <div class="empty-state-description">
              No templates match your search. Try different keywords or clear the search.
            </div>
          </div>
        \`;
      }
      
      return \`
        <div class="empty-state">
          <div class="empty-state-icon">📦</div>
          <div class="empty-state-title">No templates yet</div>
          <div class="empty-state-description">
            Create your first template or import existing ones to get started.
          </div>
        </div>
      \`;
    }

    // Update category counts
    function updateCategoryCounts() {
      const counts = {
        all: templates.length,
        skill: templates.filter(t => t.category === 'skill').length,
        command: templates.filter(t => t.category === 'command').length,
        hook: templates.filter(t => t.category === 'hook').length,
        agent: templates.filter(t => t.category === 'agent').length
      };
      
      document.getElementById('countAll').textContent = counts.all;
      document.getElementById('countSkill').textContent = counts.skill;
      document.getElementById('countCommand').textContent = counts.command;
      document.getElementById('countHook').textContent = counts.hook;
      document.getElementById('countAgent').textContent = counts.agent;
    }

    // Toggle template selection
    function toggleTemplateSelection(templateId) {
      if (selectedTemplates.has(templateId)) {
        selectedTemplates.delete(templateId);
      } else {
        selectedTemplates.add(templateId);
      }
      
      renderTemplateList();
      updateDeployButton();
    }

    // Update deploy button state
    function updateDeployButton() {
      const deployBtn = document.getElementById('deployBtn');
      deployBtn.disabled = selectedTemplates.size === 0;
    }

    // Filter by category
    function filterByCategory(category) {
      currentCategory = category;
      
      // Update tab styles
      document.querySelectorAll('.category-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.category === category);
      });
      
      renderTemplateList();
    }

    // Handle search
    function handleSearch(query) {
      searchQuery = query;
      renderTemplateList();
    }

    // Show template preview
    function showTemplatePreview(templateId) {
      vscode.postMessage({ type: 'getTemplatePreview', templateId });
    }

    // Show preview panel
    function showPreview(template) {
      currentPreviewTemplate = template;
      
      document.getElementById('previewTitle').textContent = template.name;
      
      const metaHtml = \`
        <div class="preview-meta-item">
          <span class="preview-meta-label">Category:</span>
          <span class="preview-meta-value">\${categoryIcons[template.category]} \${template.category}</span>
        </div>
        <div class="preview-meta-item">
          <span class="preview-meta-label">Source:</span>
          <span class="preview-meta-value">\${template.source}</span>
        </div>
        <div class="preview-meta-item">
          <span class="preview-meta-label">Version:</span>
          <span class="preview-meta-value">\${template.version}</span>
        </div>
        \${template.author ? \`
        <div class="preview-meta-item">
          <span class="preview-meta-label">Author:</span>
          <span class="preview-meta-value">\${escapeHtml(template.author)}</span>
        </div>
        \` : ''}
        <div class="preview-meta-item">
          <span class="preview-meta-label">Description:</span>
          <span class="preview-meta-value">\${escapeHtml(template.description)}</span>
        </div>
        \${template.tags.length > 0 ? \`
        <div class="preview-meta-item">
          <span class="preview-meta-label">Tags:</span>
          <span class="preview-meta-value">\${template.tags.map(t => escapeHtml(t)).join(', ')}</span>
        </div>
        \` : ''}
      \`;
      
      document.getElementById('previewMeta').innerHTML = metaHtml;
      document.getElementById('previewCode').textContent = template.content;
      document.getElementById('previewPanel').classList.add('visible');
    }

    // Close preview panel
    function closePreview() {
      document.getElementById('previewPanel').classList.remove('visible');
      currentPreviewTemplate = null;
    }

    // Deploy preview template
    function deployPreviewTemplate() {
      if (currentPreviewTemplate) {
        selectedTemplates.clear();
        selectedTemplates.add(currentPreviewTemplate.id);
        showDeployDialog();
      }
    }

    // Show create dialog
    function showCreateDialog() {
      document.getElementById('createDialog').classList.add('visible');
      document.getElementById('templateName').focus();
    }

    // Close create dialog
    function closeCreateDialog() {
      document.getElementById('createDialog').classList.remove('visible');
      // Clear form
      document.getElementById('templateName').value = '';
      document.getElementById('templateCategory').value = 'skill';
      document.getElementById('templateDescription').value = '';
      document.getElementById('templateTags').value = '';
      document.getElementById('templateContent').value = '';
    }

    // Create template
    function createTemplate() {
      const name = document.getElementById('templateName').value.trim();
      const category = document.getElementById('templateCategory').value;
      const description = document.getElementById('templateDescription').value.trim();
      const tagsInput = document.getElementById('templateTags').value.trim();
      const content = document.getElementById('templateContent').value;
      
      if (!name) {
        showToast('Please enter a template name', 'error');
        return;
      }
      
      if (!content) {
        showToast('Please enter template content', 'error');
        return;
      }
      
      const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];
      
      vscode.postMessage({
        type: 'createTemplate',
        data: { name, category, description, content, tags }
      });
    }

    // Deploy selected templates
    function deploySelected() {
      if (selectedTemplates.size === 0) {
        showToast('Please select templates to deploy', 'info');
        return;
      }
      showDeployDialog();
    }

    // Show deploy dialog
    function showDeployDialog() {
      const listContainer = document.getElementById('deployTemplateList');
      const selectedList = Array.from(selectedTemplates);
      
      listContainer.innerHTML = selectedList.map(id => {
        const template = templates.find(t => t.id === id);
        if (!template) return '';
        
        const icon = categoryIcons[template.category] || '📄';
        return \`
          <div class="deploy-template-item">
            <span>\${icon}</span>
            <span>\${escapeHtml(template.name)}</span>
          </div>
        \`;
      }).join('');
      
      document.getElementById('deployDialog').classList.add('visible');
    }

    // Close deploy dialog
    function closeDeployDialog() {
      document.getElementById('deployDialog').classList.remove('visible');
    }

    // Confirm deploy
    function confirmDeploy() {
      const overwriteExisting = document.getElementById('overwriteExisting').checked;
      const createBackup = document.getElementById('createBackup').checked;
      
      vscode.postMessage({
        type: 'deployTemplates',
        templateIds: Array.from(selectedTemplates),
        options: {
          overwriteExisting,
          createBackup,
          dryRun: false
        }
      });
    }

    // Handle deploy result
    function handleDeployResult(result) {
      closeDeployDialog();
      
      if (result.success) {
        const count = result.deployedTemplates.length;
        showToast(\`Successfully deployed \${count} template(s)\`, 'success');
        selectedTemplates.clear();
        renderTemplateList();
        updateDeployButton();
      } else {
        showToast(\`Deployment failed: \${result.errors.join(', ')}\`, 'error');
      }
    }

    // Import templates
    function importTemplates() {
      vscode.postMessage({ type: 'importTemplates', source: '' });
    }

    // Export selected templates
    function exportSelected() {
      if (selectedTemplates.size === 0) {
        showToast('Please select templates to export', 'info');
        return;
      }
      
      vscode.postMessage({
        type: 'exportTemplates',
        templateIds: Array.from(selectedTemplates)
      });
    }

    // Handle init wizard data
    function handleInitWizardData(analysis) {
      // Store the analysis data
      wizardProjectAnalysis = analysis;
      
      // Update project info display
      updateProjectInfoDisplay(analysis);
      
      // Load recommended templates
      loadWizardTemplates(analysis.recommendedTemplates);
      
      // Show the wizard dialog
      document.getElementById('initWizardDialog').classList.add('visible');
    }

    // ==================== Wizard Functions ====================

    // Wizard state
    let wizardCurrentStep = 1;
    let wizardProjectAnalysis = null;
    let wizardSelectedTemplates = new Set();
    let wizardRecommendedTemplates = [];

    // Project type icons
    const projectTypeIcons = {
      frontend: '🎨',
      backend: '⚙️',
      fullstack: '🔄',
      library: '📚',
      cli: '💻',
      unknown: '❓'
    };

    // Project type names
    const projectTypeNames = {
      frontend: 'Frontend',
      backend: 'Backend',
      fullstack: 'Full-Stack',
      library: 'Library',
      cli: 'CLI Tool',
      unknown: 'Unknown'
    };

    // Open init wizard
    function openInitWizard() {
      // Reset wizard state
      wizardCurrentStep = 1;
      wizardSelectedTemplates.clear();
      wizardProjectAnalysis = null;
      wizardRecommendedTemplates = [];
      
      // Reset UI
      updateWizardSteps();
      showWizardStep(1);
      document.getElementById('wizardBackBtn').style.display = 'none';
      document.getElementById('wizardNextBtn').textContent = 'Next';
      document.getElementById('projectInfo').innerHTML = '<div class="loading"><div class="loading-spinner"></div></div>';
      
      // Show dialog
      document.getElementById('initWizardDialog').classList.add('visible');
      
      // Request project analysis
      vscode.postMessage({ type: 'runInitWizard' });
    }

    // Close init wizard
    function closeInitWizard() {
      document.getElementById('initWizardDialog').classList.remove('visible');
      // Reset state
      wizardCurrentStep = 1;
      wizardSelectedTemplates.clear();
    }

    // Update project info display
    function updateProjectInfoDisplay(analysis) {
      const projectInfo = document.getElementById('projectInfo');
      const typeIcon = projectTypeIcons[analysis.type] || '❓';
      const typeName = projectTypeNames[analysis.type] || 'Unknown';
      
      const frameworksHtml = analysis.frameworks.length > 0
        ? analysis.frameworks.map(f => \`<span class="framework-tag">\${escapeHtml(f)}</span>\`).join('')
        : '<span class="framework-tag">None detected</span>';
      
      const languagesHtml = analysis.languages.length > 0
        ? analysis.languages.map(l => \`<span class="language-tag">\${escapeHtml(l)}</span>\`).join('')
        : '<span class="language-tag">Not specified</span>';
      
      const configStatus = analysis.hasClaudeConfig
        ? '<span class="config-status exists">✓ Configured</span>'
        : '<span class="config-status not-exists">○ Not configured</span>';
      
      projectInfo.innerHTML = \`
        <div class="project-info-item">
          <span class="project-info-label">Project Type:</span>
          <span class="project-info-value">
            <span class="project-type-badge">\${typeIcon} \${typeName}</span>
          </span>
        </div>
        <div class="project-info-item">
          <span class="project-info-label">Frameworks:</span>
          <span class="project-info-value">
            <div class="framework-tags">\${frameworksHtml}</div>
          </span>
        </div>
        <div class="project-info-item">
          <span class="project-info-label">Languages:</span>
          <span class="project-info-value">
            <div class="framework-tags">\${languagesHtml}</div>
          </span>
        </div>
        <div class="project-info-item">
          <span class="project-info-label">Claude Config:</span>
          <span class="project-info-value">\${configStatus}</span>
        </div>
      \`;
    }

    // Load wizard templates
    function loadWizardTemplates(recommendedIds) {
      // Filter templates to get recommended ones
      wizardRecommendedTemplates = templates.filter(t => 
        recommendedIds.some(id => 
          t.id === id || 
          t.name.toLowerCase().includes(id.toLowerCase()) ||
          t.id.toLowerCase().includes(id.toLowerCase())
        )
      );
      
      // Pre-select all recommended templates
      wizardRecommendedTemplates.forEach(t => wizardSelectedTemplates.add(t.id));
      
      renderWizardTemplateList();
    }

    // Render wizard template list
    function renderWizardTemplateList() {
      const container = document.getElementById('wizardTemplateList');
      
      if (wizardRecommendedTemplates.length === 0) {
        container.innerHTML = \`
          <div class="wizard-empty-state">
            <div class="wizard-empty-state-icon">📦</div>
            <div class="wizard-empty-state-text">No templates available for recommendation.</div>
          </div>
        \`;
        return;
      }
      
      container.innerHTML = wizardRecommendedTemplates.map(template => {
        const isSelected = wizardSelectedTemplates.has(template.id);
        const icon = categoryIcons[template.category] || '📄';
        
        return \`
          <div class="wizard-template-item \${isSelected ? 'selected' : ''}" 
               onclick="toggleWizardTemplate('\${template.id}')">
            <input type="checkbox" class="wizard-template-checkbox" 
                   \${isSelected ? 'checked' : ''} 
                   onclick="event.stopPropagation(); toggleWizardTemplate('\${template.id}')">
            <span class="wizard-template-icon">\${icon}</span>
            <div class="wizard-template-info">
              <div class="wizard-template-name">\${escapeHtml(template.name)}</div>
              <div class="wizard-template-desc">\${escapeHtml(template.description)}</div>
            </div>
            <span class="wizard-template-category">\${template.category}</span>
          </div>
        \`;
      }).join('');
    }

    // Toggle wizard template selection
    function toggleWizardTemplate(templateId) {
      if (wizardSelectedTemplates.has(templateId)) {
        wizardSelectedTemplates.delete(templateId);
      } else {
        wizardSelectedTemplates.add(templateId);
      }
      renderWizardTemplateList();
    }

    // Select all wizard templates
    function selectAllWizardTemplates() {
      wizardRecommendedTemplates.forEach(t => wizardSelectedTemplates.add(t.id));
      renderWizardTemplateList();
    }

    // Deselect all wizard templates
    function deselectAllWizardTemplates() {
      wizardSelectedTemplates.clear();
      renderWizardTemplateList();
    }

    // Quick setup - deploy recommended templates immediately
    function quickSetup() {
      if (!wizardProjectAnalysis) {
        showToast('Please wait for project analysis to complete', 'info');
        return;
      }
      
      // Select all recommended templates
      wizardRecommendedTemplates.forEach(t => wizardSelectedTemplates.add(t.id));
      
      // Skip to deployment
      wizardCurrentStep = 3;
      updateWizardSteps();
      showWizardStep(3);
      document.getElementById('wizardBackBtn').style.display = 'inline-flex';
      document.getElementById('wizardNextBtn').textContent = 'Deploy';
      
      // Show deployment preview
      showWizardDeploymentPreview();
    }

    // Update wizard step indicators
    function updateWizardSteps() {
      document.querySelectorAll('.wizard-step').forEach(step => {
        const stepNum = parseInt(step.dataset.step);
        step.classList.remove('active', 'completed');
        
        if (stepNum === wizardCurrentStep) {
          step.classList.add('active');
        } else if (stepNum < wizardCurrentStep) {
          step.classList.add('completed');
        }
      });
    }

    // Show specific wizard step
    function showWizardStep(step) {
      document.querySelectorAll('.wizard-content').forEach(content => {
        content.classList.add('hidden');
      });
      document.getElementById(\`wizardStep\${step}\`).classList.remove('hidden');
    }

    // Wizard back button
    function wizardBack() {
      if (wizardCurrentStep > 1) {
        wizardCurrentStep--;
        updateWizardSteps();
        showWizardStep(wizardCurrentStep);
        
        // Update buttons
        if (wizardCurrentStep === 1) {
          document.getElementById('wizardBackBtn').style.display = 'none';
        }
        document.getElementById('wizardNextBtn').textContent = 'Next';
      }
    }

    // Wizard next button
    function wizardNext() {
      if (wizardCurrentStep === 1) {
        // Move to template selection
        wizardCurrentStep = 2;
        updateWizardSteps();
        showWizardStep(2);
        document.getElementById('wizardBackBtn').style.display = 'inline-flex';
      } else if (wizardCurrentStep === 2) {
        // Move to deployment summary
        if (wizardSelectedTemplates.size === 0) {
          showToast('Please select at least one template', 'info');
          return;
        }
        wizardCurrentStep = 3;
        updateWizardSteps();
        showWizardStep(3);
        document.getElementById('wizardNextBtn').textContent = 'Deploy';
        showWizardDeploymentPreview();
      } else if (wizardCurrentStep === 3) {
        // Execute deployment
        executeWizardDeployment();
      }
    }

    // Show wizard deployment preview
    function showWizardDeploymentPreview() {
      const summary = document.getElementById('wizardSummary');
      const selectedList = Array.from(wizardSelectedTemplates);
      
      const templatesHtml = selectedList.map(id => {
        const template = templates.find(t => t.id === id);
        if (!template) return '';
        const icon = categoryIcons[template.category] || '📄';
        return \`<li><span class="icon">\${icon}</span> \${escapeHtml(template.name)}</li>\`;
      }).join('');
      
      summary.innerHTML = \`
        <div class="wizard-summary-section">
          <div class="wizard-summary-title">Templates to Deploy (\${selectedList.length})</div>
          <ul class="wizard-summary-list">
            \${templatesHtml}
          </ul>
        </div>
        <div class="wizard-summary-section">
          <div class="wizard-summary-title">Additional Actions</div>
          <ul class="wizard-summary-list">
            <li><span class="icon">📁</span> Create .claude/ directory structure</li>
            <li><span class="icon">📝</span> Generate CLAUDE.md configuration file</li>
          </ul>
        </div>
      \`;
    }

    // Execute wizard deployment
    function executeWizardDeployment() {
      const selectedIds = Array.from(wizardSelectedTemplates);
      
      if (selectedIds.length === 0) {
        showToast('No templates selected for deployment', 'error');
        return;
      }
      
      // Show loading state
      document.getElementById('wizardSummary').innerHTML = '<div class="loading"><div class="loading-spinner"></div></div>';
      document.getElementById('wizardNextBtn').disabled = true;
      
      // Send deployment request with wizard flag
      vscode.postMessage({
        type: 'wizardDeploy',
        templateIds: selectedIds,
        quickSetup: false
      });
    }

    // Handle wizard deployment result
    function handleWizardDeployResult(result) {
      const summary = document.getElementById('wizardSummary');
      
      if (result.success) {
        const deployedCount = result.deployedTemplates ? result.deployedTemplates.length : 0;
        const claudeMdCreated = result.claudeMdCreated ? 'Yes' : 'No';
        
        summary.innerHTML = \`
          <div class="wizard-summary-success">
            <div class="wizard-summary-success-icon">🎉</div>
            <div class="wizard-summary-success-title">Setup Complete!</div>
            <div class="wizard-summary-success-desc">
              Successfully deployed \${deployedCount} template(s).<br>
              CLAUDE.md created: \${claudeMdCreated}
            </div>
          </div>
        \`;
        
        document.getElementById('wizardNextBtn').textContent = 'Done';
        document.getElementById('wizardNextBtn').disabled = false;
        document.getElementById('wizardNextBtn').onclick = closeInitWizard;
        document.getElementById('wizardBackBtn').style.display = 'none';
        
        // Refresh template list
        vscode.postMessage({ type: 'getTemplates' });
      } else {
        summary.innerHTML = \`
          <div class="wizard-summary-success">
            <div class="wizard-summary-success-icon">❌</div>
            <div class="wizard-summary-success-title">Setup Failed</div>
            <div class="wizard-summary-success-desc">
              \${result.errors ? result.errors.join('<br>') : 'An error occurred during deployment.'}
            </div>
          </div>
        \`;
        
        document.getElementById('wizardNextBtn').textContent = 'Retry';
        document.getElementById('wizardNextBtn').disabled = false;
        document.getElementById('wizardNextBtn').onclick = executeWizardDeployment;
      }
    }

    // ==================== Sync to CLAUDE.md ====================

    // Sync deployed templates to CLAUDE.md
    function syncToClaudeMd() {
      showToast('Syncing templates to CLAUDE.md...', 'info');
      vscode.postMessage({ type: 'syncToClaudeMd' });
    }

    // Handle sync result
    function handleSyncResult(result) {
      if (result.success) {
        const categories = result.syncedCategories.length > 0 
          ? result.syncedCategories.join(', ') 
          : 'no templates';
        showToast(\`Successfully synced \${categories} to CLAUDE.md\`, 'success');
      } else {
        showToast(\`Sync failed: \${result.errors.join(', ')}\`, 'error');
      }
    }

    // Show toast notification
    function showToast(message, type = 'info') {
      const container = document.getElementById('toastContainer');
      const toast = document.createElement('div');
      toast.className = \`toast \${type}\`;
      
      const icons = {
        success: '✓',
        error: '✕',
        info: 'ℹ'
      };
      
      toast.innerHTML = \`
        <span>\${icons[type] || icons.info}</span>
        <span>\${escapeHtml(message)}</span>
      \`;
      
      container.appendChild(toast);
      
      // Auto remove after 3 seconds
      setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }

    // Escape HTML
    function escapeHtml(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  `;
}
