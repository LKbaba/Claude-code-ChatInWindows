/**
 * Modal Component Styles
 * Styles for modal dialogs, overlays, and popups
 */

export const modalStyles = `
/* ===================================
 * Modal Components
 * =================================== */

/* Modal Overlay */
.modal-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
  opacity: 0;
  visibility: hidden;
  transition: all var(--transition-normal);
  padding: var(--space-xl);
}

.modal-overlay.open {
  opacity: 1;
  visibility: visible;
}

/* Modal Container */
.modal {
  background-color: var(--vscode-editor-background);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-xl);
  max-width: 600px;
  max-height: 90vh;
  width: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transform: scale(0.95) translateY(20px);
  opacity: 0;
  transition: all var(--transition-normal);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.modal-overlay.open .modal {
  transform: scale(1) translateY(0);
  opacity: 1;
}

/* Modal Sizes */
.modal.small {
  max-width: 400px;
}

.modal.medium {
  max-width: 600px;
}

.modal.large {
  max-width: 800px;
}

.modal.fullscreen {
  max-width: 100%;
  max-height: 100%;
  height: 100%;
  border-radius: 0;
}

/* Modal Header */
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-lg);
  border-bottom: 1px solid var(--vscode-panel-border);
  flex-shrink: 0;
}

.modal-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--vscode-foreground);
  margin: 0;
}

.modal-close {
  background: none;
  border: none;
  color: var(--vscode-foreground);
  cursor: pointer;
  padding: var(--space-sm);
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  opacity: 0.7;
}

.modal-close:hover {
  opacity: 1;
  background-color: var(--color-hover-bg);
}

/* Modal Body */
.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-lg);
  min-height: 0;
}

/* Modal Footer */
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-md);
  padding: var(--space-lg);
  border-top: 1px solid var(--vscode-panel-border);
  flex-shrink: 0;
}

.modal-footer.space-between {
  justify-content: space-between;
}

/* Specific Modal Styles */

/* File Picker Modal */
.file-picker-modal {
  max-width: 700px;
}

.file-picker-header {
  padding: var(--space-lg);
  border-bottom: 1px solid var(--vscode-panel-border);
}

.file-search-input {
  width: 100%;
  padding: var(--space-md);
  background-color: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
  border-radius: var(--radius-md);
  font-size: var(--font-size-md);
  transition: all var(--transition-fast);
}

.file-search-input:focus {
  outline: none;
  border-color: var(--vscode-focusBorder);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--grad-primary-mid) 20%, transparent);
}

.file-picker-results {
  max-height: 400px;
  overflow-y: auto;
  padding: var(--space-sm);
}

.file-item {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.file-item:hover {
  background: color-mix(in srgb, var(--grad-primary-start) 5%, var(--vscode-list-hoverBackground));
}

.file-item.selected {
  background-color: var(--vscode-list-activeSelectionBackground);
  color: var(--vscode-list-activeSelectionForeground);
}

.file-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.file-path {
  font-size: var(--font-size-sm);
  font-family: var(--vscode-editor-font-family);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Settings Modal */
.settings-modal {
  max-width: 800px;
}

.settings-section {
  margin-bottom: var(--space-2xl);
  padding: var(--space-lg);
  background: color-mix(in srgb, var(--vscode-editor-foreground) 3%, var(--vscode-editor-background));
  border-radius: var(--radius-lg);
}

.settings-section-title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  margin-bottom: var(--space-lg);
  color: var(--vscode-foreground);
}

.setting-item {
  margin-bottom: var(--space-lg);
}

.setting-label {
  display: block;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  margin-bottom: var(--space-sm);
  color: var(--vscode-foreground);
}

.setting-description {
  font-size: var(--font-size-xs);
  color: var(--vscode-descriptionForeground);
  margin-bottom: var(--space-sm);
}

.setting-input {
  width: 100%;
  padding: var(--space-md);
  background-color: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  transition: all var(--transition-fast);
}

.setting-input:focus {
  outline: none;
  border-color: var(--vscode-focusBorder);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--grad-primary-mid) 20%, transparent);
}

/* Statistics Modal */
.stats-modal {
  max-width: 700px;
}

.stats-tabs {
  display: flex;
  gap: var(--space-xs);
  border-bottom: 1px solid var(--vscode-panel-border);
  padding: 0 var(--space-lg);
}

.stats-content {
  padding: var(--space-xl);
}

.stat-card {
  background: color-mix(in srgb, var(--vscode-editor-foreground) 5%, var(--vscode-editor-background));
  border: 1px solid var(--vscode-panel-border);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  margin-bottom: var(--space-lg);
}

.stat-value {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  color: var(--grad-primary-start);
  margin-bottom: var(--space-sm);
}

.stat-label {
  font-size: var(--font-size-sm);
  color: var(--vscode-descriptionForeground);
}

/* Model Selector Modal */
.model-modal {
  max-width: 500px;
}

.model-options {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-lg);
}

.model-option {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-lg);
  background-color: var(--vscode-editor-background);
  border: 2px solid var(--vscode-panel-border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.model-option:hover {
  border-color: var(--grad-primary-start);
  background: color-mix(in srgb, var(--grad-primary-start) 5%, var(--vscode-editor-background));
}

.model-option.selected {
  border-color: var(--grad-primary-start);
  background: color-mix(in srgb, var(--grad-primary-start) 10%, var(--vscode-editor-background));
}

.model-icon {
  width: 40px;
  height: 40px;
  background: var(--grad-primary);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: var(--font-weight-bold);
}

.model-info {
  flex: 1;
}

.model-name {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  margin-bottom: var(--space-xs);
}

.model-description {
  font-size: var(--font-size-sm);
  color: var(--vscode-descriptionForeground);
}

/* Thinking Intensity Modal */
.thinking-modal {
  max-width: 500px;
}

.thinking-options {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-md);
  padding: var(--space-lg);
}

.thinking-option {
  padding: var(--space-lg);
  text-align: center;
  background: color-mix(in srgb, var(--grad-thinking) 5%, var(--vscode-editor-background));
  border: 2px solid transparent;
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.thinking-option:hover {
  border-color: var(--grad-thinking);
  transform: translateY(-2px);
}

.thinking-option.selected {
  border-color: var(--grad-thinking);
  background: color-mix(in srgb, var(--grad-thinking) 15%, var(--vscode-editor-background));
}

/* Slash Commands Modal */
.slash-commands-modal {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  max-height: 300px;
  overflow-y: auto;
  background-color: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  margin-bottom: var(--space-sm);
  z-index: var(--z-popover);
}

.slash-command {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.slash-command:hover {
  background-color: var(--vscode-list-hoverBackground);
}

.slash-command-name {
  font-weight: var(--font-weight-medium);
  color: var(--grad-primary-start);
}

.slash-command-description {
  font-size: var(--font-size-sm);
  color: var(--vscode-descriptionForeground);
}

/* Alert Modal */
.alert-modal {
  max-width: 400px;
}

.alert-icon {
  width: 48px;
  height: 48px;
  margin: 0 auto var(--space-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-full);
  font-size: 24px;
}

.alert-icon.info {
  background: color-mix(in srgb, var(--grad-info) 20%, var(--vscode-editor-background));
  color: #4ECDC4;
}

.alert-icon.warning {
  background: color-mix(in srgb, var(--grad-warning) 20%, var(--vscode-editor-background));
  color: #FFC857;
}

.alert-icon.error {
  background: color-mix(in srgb, var(--grad-error) 20%, var(--vscode-editor-background));
  color: #FF6B7A;
}

.alert-icon.success {
  background: color-mix(in srgb, var(--grad-success) 20%, var(--vscode-editor-background));
  color: #23CE6B;
}

.alert-message {
  text-align: center;
  margin-bottom: var(--space-xl);
}

/* Confirm Modal */
.confirm-modal {
  max-width: 400px;
}

.confirm-message {
  font-size: var(--font-size-md);
  text-align: center;
  margin-bottom: var(--space-xl);
}

/* Modal Animations */
@keyframes modalFadeIn {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(20px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes modalFadeOut {
  from {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  to {
    opacity: 0;
    transform: scale(0.95) translateY(20px);
  }
}

/* Responsive Modal Styles */
@media (max-width: 768px) {
  .modal-overlay {
    padding: var(--space-md);
  }
  
  .modal {
    max-height: 100%;
    border-radius: var(--radius-lg);
  }
  
  .modal.large {
    max-width: 100%;
  }
  
  .file-picker-modal,
  .settings-modal,
  .stats-modal {
    max-width: 100%;
  }
  
  .thinking-options {
    grid-template-columns: 1fr;
  }
}

/* Modal Focus Trap */
.modal:focus {
  outline: none;
}

.modal-overlay:focus {
  outline: none;
}
`;