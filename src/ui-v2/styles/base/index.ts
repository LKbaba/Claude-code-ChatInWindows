/**
 * Base Styles - CSS Variables and Reset
 * Integrates design system tokens from ui-design-system.ts
 */

export const baseStyles = `
/* ===================================
 * Base Styles & Design Tokens
 * =================================== */

/* Design Tokens - Colors (from ui-design-system.ts) */
:root {
  /* Primary Gradient - SwiftGlow (#7DFBFF → #A185FF) */
  --grad-primary: linear-gradient(90deg, #7DFBFF 0%, #A185FF 100%);
  --grad-primary-start: #7DFBFF;
  --grad-primary-end: #A185FF;
  --grad-primary-mid: #8BE9FF;
  
  /* Semantic Gradients */
  --grad-success: linear-gradient(135deg, #23CE6B 0%, #00D9A3 100%);
  --grad-warning: linear-gradient(135deg, #FFC857 0%, #FFE29F 100%);
  --grad-error: linear-gradient(135deg, #FF6B7A 0%, #FF8FA3 100%);
  --grad-info: linear-gradient(135deg, #4ECDC4 0%, #44A3AA 100%);
  
  /* Tool & Status Gradients */
  --grad-thinking: linear-gradient(135deg, #B794F4 0%, #9F7AEA 100%);
  --grad-tool: linear-gradient(135deg, #63B3ED 0%, #4299E1 100%);
  
  /* Message Bubble Colors */
  --color-message-assistant: color-mix(in srgb, var(--grad-primary-start) 6%, var(--vscode-editor-background));
  --color-message-error: color-mix(in srgb, #FF6B7A 8%, var(--vscode-editor-background));
  --color-message-warning: color-mix(in srgb, #FFC857 8%, var(--vscode-editor-background));
  
  /* Additional UI Colors */
  --color-border-subtle: color-mix(in srgb, var(--vscode-panel-border) 50%, transparent);
  --color-hover-bg: color-mix(in srgb, var(--vscode-list-hoverBackground) 70%, transparent);
  --color-focus-ring: var(--grad-primary-mid);
}

/* Design Tokens - Spacing */
:root {
  --space-unit: 4px;
  --space-xs: 2px;
  --space-sm: 4px;
  --space-md: 8px;
  --space-lg: 16px;
  --space-xl: 24px;
  --space-2xl: 32px;
  --space-3xl: 48px;
  --space-4xl: 64px;
}

/* Design Tokens - Typography */
:root {
  --font-size-xs: 11px;
  --font-size-sm: 12px;
  --font-size-base: 13px;
  --font-size-md: 14px;
  --font-size-lg: 16px;
  --font-size-xl: 18px;
  --font-size-2xl: 24px;
  
  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;
  
  --line-height-tight: 1.2;
  --line-height-normal: 1.5;
  --line-height-relaxed: 1.75;
}

/* Design Tokens - Effects */
:root {
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-2xl: 16px;
  --radius-full: 9999px;
  
  --shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.1);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.15);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.2);
  --shadow-xl: 0 12px 36px rgba(0, 0, 0, 0.25);
  
  --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-normal: 250ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-slow: 350ms cubic-bezier(0.4, 0, 0.2, 1);
}

/* Design Tokens - Z-index Scale */
:root {
  --z-base: 0;
  --z-dropdown: 100;
  --z-sticky: 200;
  --z-overlay: 300;
  --z-modal: 400;
  --z-popover: 500;
  --z-tooltip: 600;
  --z-notification: 700;
}

/* CSS Reset & Base Styles */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

*::before,
*::after {
  box-sizing: inherit;
}

html {
  font-size: var(--font-size-base);
  line-height: var(--line-height-normal);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  font-family: var(--vscode-font-family);
  font-size: var(--font-size-base);
  color: var(--vscode-foreground);
  background-color: var(--vscode-editor-background);
  overflow: hidden;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

/* Focus Styles */
:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
}

/* Selection */
::selection {
  background-color: var(--vscode-editor-selectionBackground);
  color: var(--vscode-editor-selectionForeground);
}

/* Scrollbar Styles */
::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--vscode-scrollbarSlider-background) 60%, transparent);
  border-radius: var(--radius-full);
  border: 2px solid transparent;
  background-clip: padding-box;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--vscode-scrollbarSlider-hoverBackground);
}

::-webkit-scrollbar-corner {
  background: transparent;
}

/* Links */
a {
  color: var(--vscode-textLink-foreground);
  text-decoration: none;
  transition: color var(--transition-fast);
}

a:hover {
  color: var(--vscode-textLink-activeForeground);
  text-decoration: underline;
}

/* Images */
img {
  max-width: 100%;
  height: auto;
  display: block;
}

/* Lists */
ul, ol {
  list-style: none;
}

/* Headings */
h1, h2, h3, h4, h5, h6 {
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-tight);
  color: var(--vscode-foreground);
}

h1 { font-size: var(--font-size-2xl); }
h2 { font-size: var(--font-size-xl); }
h3 { font-size: var(--font-size-lg); }
h4 { font-size: var(--font-size-md); }
h5 { font-size: var(--font-size-base); }
h6 { font-size: var(--font-size-sm); }

/* Utility Classes */
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* Reduced Motion Support */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* Light Theme Adjustments */
.vscode-light {
  --grad-primary: linear-gradient(90deg, 
    color-mix(in srgb, #7DFBFF 75%, #FFFFFF),
    color-mix(in srgb, #A185FF 75%, #FFFFFF)
  );
}

/* High Contrast Theme Adjustments */
.vscode-high-contrast {
  --grad-primary: linear-gradient(90deg, #00FFFF 0%, #FF00FF 100%);
  --color-border-subtle: var(--vscode-contrastBorder);
}
`;