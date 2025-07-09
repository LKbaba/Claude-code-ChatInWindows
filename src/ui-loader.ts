/**
 * UI Loader
 * Loads the UI v2 interface
 */

import { ConfigurationManager } from './managers/ConfigurationManager';
import uiV2Html from './ui-v2/index';

// Load UI (always v2 now)
async function loadUIHtml(configManager: ConfigurationManager): Promise<string> {
    console.log('[UI Loader] Loading UI v2');
    
    if (typeof uiV2Html !== 'string') {
        console.error('[UI Loader] UI v2 is not a string:', uiV2Html);
        throw new Error(`UI v2 module did not export a string, got ${typeof uiV2Html}`);
    }
    
    return uiV2Html;
}

export { loadUIHtml };