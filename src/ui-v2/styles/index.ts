/**
 * UI V2 Styles - Main Entry Point
 * This module combines all style modules into a single CSS string
 */

import { baseStyles } from './base/index';
import { layoutStyles } from './base/layout';
import { typographyStyles } from './base/typography';
import { buttonStyles } from './components/buttons';
import { messageStyles } from './components/messages';
import { modalStyles } from './components/modals';
import { inputStyles } from './components/inputs';
import { toolStyles } from './features/tools';
import { filePickerStyles } from './features/file-picker';
import { statsStyles } from './features/statistics';
import { diffStyles } from './features/diff-viewer';
import { animationStyles } from './base/animations';
import { themeStyles } from './themes/index';

/**
 * Combine all styles in the correct order
 * Order matters: base -> layout -> components -> features -> animations -> themes
 */
export function getCombinedStyles(): string {
  return `
    /* Base Styles */
    ${baseStyles}
    ${typographyStyles}
    ${layoutStyles}
    
    /* Component Styles */
    ${buttonStyles}
    ${inputStyles}
    ${messageStyles}
    ${modalStyles}
    
    /* Feature Styles */
    ${toolStyles}
    ${filePickerStyles}
    ${statsStyles}
    ${diffStyles}
    
    /* Animations & Transitions */
    ${animationStyles}
    
    /* Theme Overrides */
    ${themeStyles}
  `;
}

/**
 * Get minified styles for production
 */
export function getMinifiedStyles(): string {
  // Simple minification - remove comments and extra whitespace
  return getCombinedStyles()
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comments
    .replace(/\s+/g, ' ') // Collapse whitespace
    .replace(/\s*([{}:;,])\s*/g, '$1') // Remove spaces around CSS syntax
    .trim();
}

// Export individual modules for testing/development
export {
  baseStyles,
  layoutStyles,
  typographyStyles,
  buttonStyles,
  messageStyles,
  modalStyles,
  inputStyles,
  toolStyles,
  filePickerStyles,
  statsStyles,
  diffStyles,
  animationStyles,
  themeStyles
};