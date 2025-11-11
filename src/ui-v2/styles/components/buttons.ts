/**
 * Button Component Styles
 * All button variants and states
 */

export const buttonStyles = `
/* ===================================
 * Button Components
 * =================================== */

/* Base Button Styles */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-lg);
  border: none;
  border-radius: var(--radius-md);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  line-height: 1;
  cursor: pointer;
  transition: all var(--transition-fast);
  position: relative;
  overflow: hidden;
  white-space: nowrap;
  user-select: none;
  text-decoration: none;
  background-color: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

/* Gradient overlay for hover effect */
.btn::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--grad-primary);
  opacity: 0;
  transition: opacity var(--transition-fast);
  z-index: -1;
}

.btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
  background-color: var(--vscode-button-hoverBackground);
}

.btn:hover:not(:disabled)::before {
  opacity: 0.1;
}

.btn:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: none;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
}

/* Button Variants */

/* Primary Button */
.btn.primary {
  background: var(--grad-primary);
  color: white;
  border: none;
}

.btn.primary:hover:not(:disabled) {
  box-shadow: 0 4px 16px color-mix(in srgb, var(--grad-primary-start) 25%, transparent);
  transform: translateY(-2px);
}

/* Outlined Button */
.btn.outlined {
  background-color: transparent;
  border: 1px solid var(--vscode-panel-border);
  color: var(--vscode-foreground);
}

.btn.outlined:hover:not(:disabled) {
  background-color: var(--vscode-toolbar-hoverBackground);
  border-color: var(--vscode-focusBorder);
}

/* Secondary Button */
.btn.secondary,
.secondary-button {
  background-color: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  border: 1px solid var(--vscode-panel-border);
}

.btn.secondary:hover:not(:disabled),
.secondary-button:hover:not(:disabled) {
  background-color: var(--vscode-button-secondaryHoverBackground);
}

/* Ghost Button */
.btn.ghost {
  background-color: transparent;
  color: var(--vscode-foreground);
  border: none;
}

.btn.ghost:hover:not(:disabled) {
  background-color: var(--color-hover-bg);
}

/* Icon Button */
.btn.icon,
.icon-button {
  padding: var(--space-sm);
  min-width: 32px;
  min-height: 32px;
  background-color: transparent;
  color: var(--vscode-foreground);
  border: 1px solid var(--vscode-panel-border);
}

.btn.icon:hover:not(:disabled),
.icon-button:hover:not(:disabled) {
  background-color: var(--vscode-toolbar-hoverBackground);
  border-color: var(--vscode-focusBorder);
}

/* Button Sizes */
.btn.small {
  padding: var(--space-xs) var(--space-md);
  font-size: var(--font-size-sm);
  min-height: 24px;
}

.btn.large {
  padding: var(--space-md) var(--space-xl);
  font-size: var(--font-size-md);
  min-height: 40px;
}

/* Special Purpose Buttons */

/* Send Button */
.send-btn {
  background: var(--grad-primary);
  color: white;
  border: none;
  padding: var(--space-md) var(--space-lg);
  border-radius: var(--radius-md);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-weight: var(--font-weight-medium);
  transition: all var(--transition-fast);
  min-width: 80px;
}

.send-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px color-mix(in srgb, var(--grad-primary-start) 25%, transparent);
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Stop Button */
.btn.stop {
  background: var(--grad-error);
  color: white;
  border: none;
  animation: pulse 2s ease-in-out infinite;
}

.btn.stop:hover:not(:disabled) {
  animation: none;
  box-shadow: 0 4px 16px color-mix(in srgb, #FF6B7A 25%, transparent);
}

/* Copy Button */
.copy-btn {
  position: absolute;
  top: var(--space-sm);
  right: var(--space-sm);
  background-color: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  cursor: pointer;
  opacity: 0;
  transition: all var(--transition-fast);
  font-size: var(--font-size-sm);
  z-index: var(--z-dropdown);
}

.message:hover .copy-btn,
.copy-btn:focus {
  opacity: 1;
}

.copy-btn:hover {
  background-color: var(--vscode-button-hoverBackground);
}

/* Restore Button */
.restore-btn {
  background: var(--grad-info);
  color: white;
  border: none;
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  margin-top: var(--space-md);
}

.restore-btn.dark {
  background: var(--grad-warning);
}

.restore-btn:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

/* Tool Buttons */
/* 注意：这些样式目前未被使用，实际样式在 index.ts 的 getStylesOld() 中 */
.tools-btn {
  background-color: transparent;
  color: var(--vscode-foreground);
  border: 1px solid var(--vscode-panel-border);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  transition: all var(--transition-fast);
  font-size: var(--font-size-sm);
}

.tools-btn:hover {
  background-color: var(--vscode-toolbar-hoverBackground);
  border-color: var(--vscode-focusBorder);
}

/* / Button (Slash Commands) 和 @ Button (File Reference) - 斜杠命令和文件引用按钮 */
/* 参考 reference/claude-code-chat/src/ui-styles.ts 第1435-1451行 */
.slash-btn,
.at-btn {
  background-color: transparent;
  color: var(--vscode-foreground);
  border: none;
  padding: 4px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  transition: all 0.2s ease;
}

.slash-btn:hover,
.at-btn:hover {
  background-color: var(--vscode-list-hoverBackground);
}

/* Image Button */
.image-btn {
  background-color: transparent;
  color: var(--vscode-foreground);
  border: 1px solid var(--vscode-panel-border);
  padding: var(--space-sm);
  border-radius: var(--radius-sm);
  cursor: pointer;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
  font-size: 18px;
}

.image-btn:hover {
  background-color: var(--vscode-toolbar-hoverBackground);
  border-color: var(--vscode-focusBorder);
}

/* Expand/Collapse Buttons */
.diff-expand-btn {
  background-color: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--font-size-sm);
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  transition: all var(--transition-fast);
}

.diff-expand-btn:hover {
  background-color: var(--vscode-button-hoverBackground);
  transform: translateY(-1px);
}

.diff-expand-btn:active {
  transform: translateY(0);
}

/* Close Button */
.close-btn,
.tools-close-btn {
  background: none;
  border: none;
  color: var(--vscode-foreground);
  cursor: pointer;
  padding: var(--space-sm);
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
  opacity: 0.7;
}

.close-btn:hover,
.tools-close-btn:hover {
  opacity: 1;
  background-color: var(--color-hover-bg);
}

/* Confirm Button */
.confirm-btn {
  background: var(--grad-success);
  color: white;
  border: none;
  padding: var(--space-md) var(--space-xl);
  border-radius: var(--radius-md);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: all var(--transition-fast);
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
}

.confirm-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px color-mix(in srgb, #23CE6B 25%, transparent);
}

/* Tab Buttons */
.tab-btn,
.stats-tab {
  background-color: transparent;
  color: var(--vscode-foreground);
  border: none;
  border-bottom: 2px solid transparent;
  padding: var(--space-sm) var(--space-lg);
  cursor: pointer;
  transition: all var(--transition-fast);
  font-weight: var(--font-weight-medium);
  opacity: 0.7;
}

.tab-btn:hover,
.stats-tab:hover {
  opacity: 1;
  background-color: var(--color-hover-bg);
}

.tab-btn.active,
.stats-tab.active {
  opacity: 1;
  border-bottom-color: var(--grad-primary-start);
  color: var(--grad-primary-start);
}

/* Model Selector Button */
.model-selector {
  background-color: var(--vscode-dropdown-background);
  color: var(--vscode-dropdown-foreground);
  border: 1px solid var(--vscode-dropdown-border);
  padding: var(--space-sm) var(--space-lg) var(--space-sm) var(--space-md);
  padding-right: var(--space-2xl);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  transition: all var(--transition-fast);
  position: relative;
}

.model-selector::after {
  content: '▼';
  position: absolute;
  right: var(--space-md);
  top: 50%;
  transform: translateY(-50%);
  font-size: 10px;
  opacity: 0.7;
}

.model-selector:hover {
  background-color: var(--vscode-dropdown-hoverBackground);
  border-color: var(--vscode-focusBorder);
}

/* Button Groups */
.btn-group {
  display: inline-flex;
  gap: var(--space-xs);
}

.btn-group .btn {
  border-radius: 0;
}

.btn-group .btn:first-child {
  border-top-left-radius: var(--radius-md);
  border-bottom-left-radius: var(--radius-md);
}

.btn-group .btn:last-child {
  border-top-right-radius: var(--radius-md);
  border-bottom-right-radius: var(--radius-md);
}

/* Button with Loading State */
.btn.loading {
  color: transparent;
  pointer-events: none;
}

.btn.loading::after {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  border: 2px solid transparent;
  border-top-color: currentColor;
  border-radius: var(--radius-full);
  animation: spin 0.8s linear infinite;
}

/* Floating Action Button */
.fab {
  position: fixed;
  bottom: var(--space-xl);
  right: var(--space-xl);
  width: 56px;
  height: 56px;
  border-radius: var(--radius-full);
  background: var(--grad-primary);
  color: white;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-lg);
  transition: all var(--transition-fast);
  z-index: var(--z-sticky);
}

.fab:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-xl);
}

.fab:active {
  transform: translateY(0);
}

/* Button Focus States for Accessibility */
.btn:focus-visible,
button:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
}

/* Dark Theme Specific Button Adjustments */
.vscode-dark .btn.outlined {
  border-color: color-mix(in srgb, var(--vscode-panel-border) 70%, transparent);
}

.vscode-dark .btn.ghost:hover {
  background-color: color-mix(in srgb, var(--vscode-foreground) 10%, transparent);
}

/* High Contrast Theme Button Adjustments */
.vscode-high-contrast .btn {
  border: 1px solid var(--vscode-contrastBorder);
}

.vscode-high-contrast .btn:focus-visible {
  outline-color: var(--vscode-focusBorder);
}
`;