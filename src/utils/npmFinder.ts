/**
 * npm executable finder
 * Resolves npm not found issues in VS Code extension environment
 */

import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import * as util from 'util';
import { debugLog, debugError } from '../services/DebugLogger';

const exec = util.promisify(cp.exec);

/**
 * Find and return available npm executable path
 * Try multiple possible locations including system path and common installation locations
 */
export async function findNpmExecutable(): Promise<string | null> {
    const homeDir = require('os').homedir();
    let possiblePaths: string[];

    if (process.platform === 'darwin') {
        // Mac paths
        possiblePaths = [
            // 1. Try direct execution (if in PATH)
            'npm',

            // 2. Homebrew Intel Mac
            '/usr/local/bin/npm',

            // 3. Homebrew Apple Silicon
            '/opt/homebrew/bin/npm',

            // 4. User global npm
            path.join(homeDir, '.npm-global', 'bin', 'npm'),

            // 5. System npm
            '/usr/bin/npm',
        ];

        // 6. nvm installation - dynamically find all installed node versions
        const nvmDir = path.join(homeDir, '.nvm', 'versions', 'node');
        if (fs.existsSync(nvmDir)) {
            try {
                const versions = fs.readdirSync(nvmDir);
                for (const version of versions) {
                    possiblePaths.push(path.join(nvmDir, version, 'bin', 'npm'));
                }
            } catch (e) {
                // Ignore read errors
            }
        }
    } else {
        // Windows paths
        possiblePaths = [
            // 1. Try direct execution (if in PATH)
            'npm',

            // 2. User-level npm installation location
            path.join(process.env.APPDATA || '', 'npm', 'npm.cmd'),
            path.join(process.env.APPDATA || '', 'npm', 'npm'),

            // 3. System-level Node.js installation location
            path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'npm.cmd'),
            path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'npm'),

            // 4. x86 version of Node.js
            path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'nodejs', 'npm.cmd'),
            path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'nodejs', 'npm'),

            // 5. Common custom installation locations
            'C:\\nodejs\\npm.cmd',
            'C:\\nodejs\\npm',
            'D:\\nodejs\\npm.cmd',
            'D:\\nodejs\\npm',

            // 6. Additional Scoop installation location (popular Windows package manager)
            path.join(process.env.USERPROFILE || '', 'scoop', 'shims', 'npm.cmd'),
            path.join(process.env.USERPROFILE || '', 'scoop', 'shims', 'npm'),

            // 7. Chocolatey installation location
            'C:\\ProgramData\\chocolatey\\bin\\npm.cmd',
            'C:\\ProgramData\\chocolatey\\bin\\npm',
        ];
    }

    debugLog('npmFinder', 'Starting to find npm executable...');

    // Try each path
    for (const npmPath of possiblePaths) {
        try {
            if (npmPath === 'npm') {
                // Try direct execution
                const { stdout } = await exec('npm --version');
                debugLog('npmFinder', `Success: Found npm in PATH, version: ${stdout.trim()}`);
                return 'npm';
            } else if (npmPath && fs.existsSync(npmPath)) {
                // Check if file exists and is executable
                const { stdout } = await exec(`"${npmPath}" --version`);
                debugLog('npmFinder', `Success: Found npm at ${npmPath}, version: ${stdout.trim()}`);
                return npmPath;
            }
        } catch (error) {
            // Continue to try next path
            if (npmPath !== 'npm') {
                debugLog('npmFinder', `Not found at ${npmPath}`);
            }
            continue;
        }
    }

    debugError('npmFinder', 'Could not find npm in any known location');
    return null;
}

/**
 * Execute npm config get prefix command
 * Using the found npm path
 */
export async function getNpmPrefix(): Promise<string | undefined> {
    try {
        const npmPath = await findNpmExecutable();

        if (!npmPath) {
            debugError('npmFinder', 'Could not find npm executable');
            return undefined;
        }

        // Execute command using found npm path
        const command = npmPath === 'npm'
            ? 'npm config get prefix'
            : `"${npmPath}" config get prefix`;

        debugLog('npmFinder', `Executing command: ${command}`);
        const { stdout } = await exec(command);
        const prefix = stdout.trim();

        if (!prefix) {
            debugError('npmFinder', 'npm config get prefix returned empty');
            return undefined;
        }

        debugLog('npmFinder', `Successfully got npm prefix: ${prefix}`);
        return prefix;
    } catch (error) {
        debugError('npmFinder', 'Failed to execute npm config get prefix', error);
        return undefined;
    }
}

/**
 * Verify if npm is available and return version information
 */
export async function verifyNpmInstallation(): Promise<{ available: boolean; version?: string; path?: string }> {
    const npmPath = await findNpmExecutable();

    if (!npmPath) {
        return { available: false };
    }

    try {
        const command = npmPath === 'npm' ? 'npm --version' : `"${npmPath}" --version`;
        const { stdout } = await exec(command);
        return {
            available: true,
            version: stdout.trim(),
            path: npmPath
        };
    } catch (error) {
        return { available: false };
    }
}