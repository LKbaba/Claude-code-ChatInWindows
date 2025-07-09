/**
 * Theme Styles
 * Theme-specific overrides and adjustments
 */

export const themeStyles = `
/* ===================================
 * Theme Support
 * =================================== */

/* Light Theme Overrides */
.vscode-light {
  /* Adjust gradients for light theme */
  --grad-primary: linear-gradient(90deg, 
    color-mix(in srgb, #7DFBFF 75%, #FFFFFF),
    color-mix(in srgb, #A185FF 75%, #FFFFFF)
  );
  
  /* Adjust message backgrounds */
  --color-message-assistant: color-mix(in srgb, var(--grad-primary-start) 4%, var(--vscode-editor-background));
  --color-message-error: color-mix(in srgb, #FF6B7A 6%, var(--vscode-editor-background));
  --color-message-warning: color-mix(in srgb, #FFC857 6%, var(--vscode-editor-background));
  
  /* Adjust hover states */
  --color-hover-bg: color-mix(in srgb, var(--vscode-list-hoverBackground) 50%, transparent);
}

/* Light theme specific adjustments */
.vscode-light .message.claude::after,
.vscode-light .message.assistant::after {
  background: radial-gradient(
    circle,
    color-mix(in srgb, var(--grad-primary-end) 5%, transparent) 0%,
    transparent 70%
  );
}

.vscode-light .tool-header {
  background: color-mix(in srgb, var(--grad-tool) 3%, var(--vscode-editor-background));
}

.vscode-light .diff-line.added {
  background-color: color-mix(in srgb, var(--vscode-diffEditor-insertedTextBackground) 70%, transparent);
}

.vscode-light .diff-line.removed {
  background-color: color-mix(in srgb, var(--vscode-diffEditor-removedTextBackground) 70%, transparent);
}

.vscode-light .stat-card {
  background: color-mix(in srgb, var(--vscode-editor-foreground) 2%, var(--vscode-editor-background));
}

.vscode-light .file-item:hover {
  background: color-mix(in srgb, var(--grad-primary-start) 3%, var(--vscode-list-hoverBackground));
}

/* Dark Theme (Default) */
.vscode-dark {
  /* Dark theme is the default, so these are already defined in base styles */
}

/* High Contrast Theme Overrides */
.vscode-high-contrast {
  /* Use more vivid colors for high contrast */
  --grad-primary: linear-gradient(90deg, #00FFFF 0%, #FF00FF 100%);
  --grad-success: linear-gradient(135deg, #00FF00 0%, #00FF00 100%);
  --grad-warning: linear-gradient(135deg, #FFFF00 0%, #FFFF00 100%);
  --grad-error: linear-gradient(135deg, #FF0000 0%, #FF0000 100%);
  --grad-info: linear-gradient(135deg, #00FFFF 0%, #00FFFF 100%);
  
  /* Stronger borders */
  --color-border-subtle: var(--vscode-contrastBorder);
}

/* High contrast specific adjustments */
.vscode-high-contrast .btn {
  border: 1px solid var(--vscode-contrastBorder);
}

.vscode-high-contrast .message {
  border: 1px solid var(--vscode-contrastBorder);
}

.vscode-high-contrast .modal {
  border: 2px solid var(--vscode-contrastBorder);
}

.vscode-high-contrast .input,
.vscode-high-contrast input,
.vscode-high-contrast textarea,
.vscode-high-contrast select {
  border: 1px solid var(--vscode-contrastBorder);
}

.vscode-high-contrast .tool-container {
  border: 1px solid var(--vscode-contrastBorder);
}

.vscode-high-contrast .diff-container {
  border: 1px solid var(--vscode-contrastBorder);
}

/* Focus states for high contrast */
.vscode-high-contrast :focus-visible {
  outline: 2px solid var(--vscode-focusBorder);
  outline-offset: 2px;
}

/* Theme-aware shadows */
.vscode-light {
  --shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.08);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.12);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.16);
  --shadow-xl: 0 12px 36px rgba(0, 0, 0, 0.20);
}

.vscode-dark {
  --shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.2);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.4);
  --shadow-xl: 0 12px 36px rgba(0, 0, 0, 0.5);
}

.vscode-high-contrast {
  --shadow-sm: none;
  --shadow-md: none;
  --shadow-lg: none;
  --shadow-xl: none;
}

/* Scrollbar theme adjustments */
.vscode-light ::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--vscode-scrollbarSlider-background) 80%, transparent);
}

.vscode-high-contrast ::-webkit-scrollbar-thumb {
  background: var(--vscode-scrollbarSlider-background);
  border: 1px solid var(--vscode-contrastBorder);
}

/* Code block theme adjustments */
.vscode-light pre {
  background: color-mix(in srgb, var(--grad-primary-start) 2%, var(--vscode-textCodeBlock-background));
  border: 1px solid color-mix(in srgb, var(--grad-primary-start) 8%, var(--vscode-panel-border));
}

.vscode-high-contrast pre {
  border: 1px solid var(--vscode-contrastBorder);
}

/* Button theme adjustments */
.vscode-light .btn.primary {
  box-shadow: 0 2px 8px color-mix(in srgb, var(--grad-primary-start) 20%, transparent);
}

.vscode-light .btn.primary:hover:not(:disabled) {
  box-shadow: 0 4px 16px color-mix(in srgb, var(--grad-primary-start) 30%, transparent);
}

/* Loading states theme adjustments */
.vscode-light .loading-spinner {
  border-color: var(--vscode-progressBar-background);
  border-top-color: var(--grad-primary-start);
  border-right-color: var(--grad-primary-end);
}

.vscode-high-contrast .loading-spinner {
  border-color: var(--vscode-contrastBorder);
  border-top-color: var(--vscode-foreground);
}

/* Status indicators theme adjustments */
.vscode-light .tool-status.running .tool-status-indicator {
  box-shadow: 0 0 0 8px color-mix(in srgb, var(--vscode-testing-iconQueued) 20%, transparent);
}

.vscode-high-contrast .tool-status-indicator {
  border: 1px solid var(--vscode-contrastBorder);
}

/* Modal backdrop adjustments */
.vscode-light .modal-overlay {
  background-color: rgba(0, 0, 0, 0.3);
}

.vscode-high-contrast .modal-overlay {
  background-color: rgba(0, 0, 0, 0.8);
}

/* Toast notification theme adjustments */
.vscode-light .toast {
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
}

.vscode-high-contrast .toast {
  border: 1px solid var(--vscode-contrastBorder);
  box-shadow: none;
}

/* Tab theme adjustments */
.vscode-light .stats-tab.active {
  border-bottom-color: color-mix(in srgb, var(--grad-primary-start) 70%, black);
}

.vscode-high-contrast .stats-tab {
  border: 1px solid transparent;
}

.vscode-high-contrast .stats-tab.active {
  border-color: var(--vscode-contrastBorder);
  border-bottom-color: var(--vscode-foreground);
}

/* Responsive theme adjustments */
@media (max-width: 768px) {
  .vscode-light .modal {
    box-shadow: var(--shadow-md);
  }
  
  .vscode-high-contrast .modal {
    border-width: 1px;
  }
}

/* Print styles */
@media print {
  /* Reset colors for printing */
  * {
    color: black !important;
    background: white !important;
    box-shadow: none !important;
    text-shadow: none !important;
  }
  
  /* Hide UI elements */
  .header,
  .input-area,
  .btn,
  .modal-overlay,
  .tool-actions,
  .message-actions {
    display: none !important;
  }
  
  /* Adjust message styles for print */
  .message {
    border: 1px solid #ccc !important;
    page-break-inside: avoid;
  }
  
  /* Show URLs for links */
  a[href]:after {
    content: " (" attr(href) ")";
  }
  
  /* Page margins */
  @page {
    margin: 2cm;
  }
}

/* Motion preferences */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  
  /* Remove parallax effects */
  .message.claude::after,
  .message.assistant::after {
    display: none;
  }
}

/* Color scheme preferences */
@media (prefers-color-scheme: light) {
  :root {
    /* Additional light mode adjustments can go here */
  }
}

@media (prefers-color-scheme: dark) {
  :root {
    /* Additional dark mode adjustments can go here */
  }
}

/* Contrast preferences */
@media (prefers-contrast: high) {
  :root {
    /* Increase contrast for all themes */
    --vscode-foreground: white;
    --vscode-editor-background: black;
  }
}

@media (prefers-contrast: low) {
  :root {
    /* Reduce contrast for all themes */
    opacity: 0.9;
  }
}
`;