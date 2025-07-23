/**
 * Layout Styles - Main layout containers and structure
 */

export const layoutStyles = `
/* ===================================
 * Layout Styles
 * =================================== */

/* Main Layout Structure */
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

/* Header */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--vscode-panel-border);
  background-color: var(--vscode-titleBar-activeBackground);
  flex-shrink: 0;
  min-height: 48px;
  z-index: var(--z-sticky);
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.header h2 {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  margin: 0;
}

/* Messages Container */
.messages-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: var(--space-xl);
  scroll-behavior: smooth;
}

.messages-container::-webkit-scrollbar {
  width: 8px;
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: var(--vscode-descriptionForeground);
}

.empty-state-icon {
  font-size: 48px;
  opacity: 0.5;
  margin-bottom: var(--space-lg);
}

.empty-state-message {
  font-size: var(--font-size-md);
  margin-bottom: var(--space-md);
}

/* Input Area */
.input-area {
  border-top: 1px solid var(--vscode-panel-border);
  background-color: var(--vscode-editor-background);
  padding: var(--space-lg);
  flex-shrink: 0;
}

.input-wrapper {
  display: flex;
  gap: var(--space-md);
  align-items: flex-end;
}

.input-controls {
  display: flex;
  gap: var(--space-sm);
  margin-bottom: var(--space-sm);
}

.input-actions {
  display: flex;
  gap: var(--space-sm);
  flex-shrink: 0;
}

/* Status Bar */
.status-bar {
  display: flex;
  align-items: center;
  padding: var(--space-sm) var(--space-lg);
  background-color: var(--vscode-statusBar-background);
  color: var(--vscode-statusBar-foreground);
  font-size: var(--font-size-sm);
  border-top: 1px solid var(--vscode-panel-border);
  gap: var(--space-lg);
}

.status-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.status-separator {
  width: 1px;
  height: 14px;
  background-color: var(--vscode-statusBar-border);
}

/* Token Display */
.token-display {
  display: flex;
  gap: var(--space-lg);
  font-size: var(--font-size-sm);
  color: var(--vscode-descriptionForeground);
}

.token-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

/* Session Info */
.session-info {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.session-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  background: color-mix(in srgb, var(--grad-primary-start) 10%, var(--vscode-badge-background));
  color: var(--vscode-badge-foreground);
  padding: var(--space-xs) var(--space-md);
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
}

/* Panel Layout (for sidebars, etc) */
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--vscode-sideBar-background);
  border-right: 1px solid var(--vscode-panel-border);
}

.panel-header {
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--vscode-panel-border);
  flex-shrink: 0;
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-lg);
}

/* Grid Layouts */
.grid {
  display: grid;
  gap: var(--space-md);
}

.grid-cols-2 {
  grid-template-columns: repeat(2, 1fr);
}

.grid-cols-3 {
  grid-template-columns: repeat(3, 1fr);
}

.grid-cols-4 {
  grid-template-columns: repeat(4, 1fr);
}

/* Flexbox Utilities */
.flex {
  display: flex;
}

.flex-row {
  flex-direction: row;
}

.flex-col {
  flex-direction: column;
}

.flex-wrap {
  flex-wrap: wrap;
}

.items-center {
  align-items: center;
}

.items-start {
  align-items: flex-start;
}

.items-end {
  align-items: flex-end;
}

.justify-center {
  justify-content: center;
}

.justify-between {
  justify-content: space-between;
}

.justify-end {
  justify-content: flex-end;
}

.gap-xs { gap: var(--space-xs); }
.gap-sm { gap: var(--space-sm); }
.gap-md { gap: var(--space-md); }
.gap-lg { gap: var(--space-lg); }
.gap-xl { gap: var(--space-xl); }

/* Responsive Layout */
@media (max-width: 768px) {
  .header {
    flex-wrap: wrap;
    gap: var(--space-md);
  }
  
  .header-left,
  .header-right {
    width: 100%;
    justify-content: space-between;
  }
  
  .messages-container {
    padding: var(--space-md);
  }
  
  .input-area {
    padding: var(--space-md);
  }
  
  .token-display {
    flex-wrap: wrap;
    gap: var(--space-md);
  }
  
  .grid-cols-2,
  .grid-cols-3,
  .grid-cols-4 {
    grid-template-columns: 1fr;
  }
}

/* Container Utilities */
.container {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--space-lg);
}

.container-sm {
  max-width: 800px;
}

.container-lg {
  max-width: 1400px;
}

/* Spacing Utilities */
.m-0 { margin: 0; }
.m-auto { margin: auto; }
.mt-sm { margin-top: var(--space-sm); }
.mt-md { margin-top: var(--space-md); }
.mt-lg { margin-top: var(--space-lg); }
.mb-sm { margin-bottom: var(--space-sm); }
.mb-md { margin-bottom: var(--space-md); }
.mb-lg { margin-bottom: var(--space-lg); }

.p-0 { padding: 0; }
.p-sm { padding: var(--space-sm); }
.p-md { padding: var(--space-md); }
.p-lg { padding: var(--space-lg); }
.px-sm { padding-left: var(--space-sm); padding-right: var(--space-sm); }
.px-md { padding-left: var(--space-md); padding-right: var(--space-md); }
.px-lg { padding-left: var(--space-lg); padding-right: var(--space-lg); }
.py-sm { padding-top: var(--space-sm); padding-bottom: var(--space-sm); }
.py-md { padding-top: var(--space-md); padding-bottom: var(--space-md); }
.py-lg { padding-top: var(--space-lg); padding-bottom: var(--space-lg); }

/* Width & Height Utilities */
.w-full { width: 100%; }
.h-full { height: 100%; }
.min-h-0 { min-height: 0; }
.max-w-full { max-width: 100%; }

/* Position Utilities */
.relative { position: relative; }
.absolute { position: absolute; }
.fixed { position: fixed; }
.sticky { position: sticky; }

/* Overflow Utilities */
.overflow-hidden { overflow: hidden; }
.overflow-auto { overflow: auto; }
.overflow-y-auto { overflow-y: auto; }
.overflow-x-hidden { overflow-x: hidden; }

/* Input Modes */
.input-modes {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  margin-bottom: var(--space-sm);
}

/* Token Usage Indicator */
.token-usage-indicator {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: var(--radius-md);
  font-size: var(--font-size-xs);
}

.usage-display {
  display: flex;
  align-items: center;
  gap: 8px;
}

.usage-segments {
  display: inline-flex;
  align-items: center;
  gap: 1px;
}

.usage-segment {
  font-size: 14px;
  line-height: 1;
  color: rgba(255, 255, 255, 0.15);
  margin-right: 1px;
  transition: all 0.3s ease;
  display: inline-block;
  opacity: 0.5;
}

.usage-segment.filled {
  opacity: 1;
  color: #4CAF50;
  text-shadow: 0 0 3px currentColor;
  font-weight: bold;
}

.usage-segment.filled.usage-green {
  color: #66BB6A;
  text-shadow: 0 0 3px #4CAF50;
}

.usage-segment.filled.usage-yellow {
  color: #FFCA28;
  text-shadow: 0 0 3px #FFC107;
}

.usage-segment.filled.usage-red {
  color: #EF5350;
  text-shadow: 0 0 3px #F44336;
}

.usage-label {
  font-size: var(--font-size-xs);
  color: var(--vscode-descriptionForeground);
  margin-right: 8px;
  opacity: 0.8;
}

.usage-text {
  font-weight: var(--font-weight-medium);
  font-size: var(--font-size-xs);
  min-width: 35px;
  text-align: right;
  margin-right: 4px;
  color: var(--vscode-descriptionForeground);
  opacity: 0.9;
}

/* Compact Button */
.compact-btn {
  font-size: var(--font-size-sm);
  padding: 6px 12px;
  background: color-mix(in srgb, var(--grad-primary-start) 20%, transparent);
  border: 1px solid var(--grad-primary-start);
  transition: all 0.2s ease;
}

.compact-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--grad-primary-start) 30%, transparent);
  border-color: var(--grad-primary-mid);
}

.compact-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
`;