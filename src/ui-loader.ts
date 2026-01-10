/**
 * UI Loader
 * Loads the UI v2 interface
 */

import uiV2Html from './ui-v2/index';
import { debugLog, debugError } from './services/DebugLogger';

// Load UI (always v2 now)
async function loadUIHtml(): Promise<string> {
    debugLog('UILoader', 'Loading UI v2');

    if (typeof uiV2Html !== 'string') {
        debugError('UILoader', `UI v2 is not a string: ${typeof uiV2Html}`);
        throw new Error(`UI v2 module did not export a string, got ${typeof uiV2Html}`);
    }

    return uiV2Html;
}

export { loadUIHtml };