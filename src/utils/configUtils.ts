/**
 * Configuration utilities shared across different configuration managers
 */

import * as os from 'os';

/**
 * Expands environment variables in a string
 * Supports both ${VAR} and $VAR syntax
 * @param value String containing environment variables
 * @returns String with expanded variables
 */
export function expandVariables(value: string): string {
    if (!value || typeof value !== 'string') {
        return value;
    }

    // First, handle escaped variables \${VAR} -> ${VAR}
    value = value.replace(/\\\$\{([^}]+)\}/g, '${$1}');

    // Replace ${VAR} and $VAR with environment variable values
    return value.replace(/\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, p1, p2) => {
        const varName = p1 || p2;
        const envValue = process.env[varName];
        
        // If variable exists, return its value; otherwise, return original
        if (envValue !== undefined) {
            return envValue;
        }
        
        // Special handling for common variables
        if (varName === 'HOME' || varName === 'USERPROFILE') {
            return os.homedir();
        }
        
        // Return original if variable not found
        return match;
    });
}