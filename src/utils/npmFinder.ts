/**
 * npm executable finder
 * Resolves npm not found issues in VS Code extension environment
 */

import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import * as util from 'util';

const exec = util.promisify(cp.exec);

/**
 * Find and return available npm executable path
 * Try multiple possible locations including system path and common installation locations
 */
export async function findNpmExecutable(): Promise<string | null> {
    const platform = process.platform;
    const possiblePaths: string[] = [];

    // 1. Try direct execution (if in PATH) - works on all platforms
    possiblePaths.push('npm');

    if (platform === 'darwin') {
        // macOS 特定路径
        possiblePaths.push(
            // Homebrew 安装位置
            '/usr/local/bin/npm',
            '/opt/homebrew/bin/npm',
            // nvm 安装位置
            path.join(process.env.HOME || '', '.nvm/versions/node/*/bin/npm'),
            // 系统默认位置
            '/usr/bin/npm'
        );
    } else if (platform === 'win32') {
        // Windows 特定路径
        possiblePaths.push(
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
            'C:\\ProgramData\\chocolatey\\bin\\npm'
        );
    }

    console.log('[npmFinder] Starting to find npm executable...');

    // Try each path
    for (const npmPath of possiblePaths) {
        try {
            if (npmPath === 'npm') {
                // Try direct execution
                const { stdout } = await exec('npm --version');
                console.log(`[npmFinder] Success: Found npm in PATH, version: ${stdout.trim()}`);
                return 'npm';
            } else if (npmPath && !npmPath.includes('*') && fs.existsSync(npmPath)) {
                // Check if file exists and is executable
                const { stdout } = await exec(`"${npmPath}" --version`);
                console.log(`[npmFinder] Success: Found npm at ${npmPath}, version: ${stdout.trim()}`);
                return npmPath;
            }
        } catch (error) {
            // Continue to try next path
            if (npmPath !== 'npm') {
                console.log(`[npmFinder] Not found at ${npmPath}`);
            }
            continue;
        }
    }

    console.error('[npmFinder] Error: Could not find npm in any known location');
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
            console.error('[npmFinder] Could not find npm executable');
            return undefined;
        }

        // Execute command using found npm path
        const command = npmPath === 'npm'
            ? 'npm config get prefix'
            : `"${npmPath}" config get prefix`;

        console.log(`[npmFinder] Executing command: ${command}`);
        const { stdout } = await exec(command);
        const prefix = stdout.trim();

        if (!prefix) {
            console.error('[npmFinder] npm config get prefix returned empty');
            return undefined;
        }

        console.log(`[npmFinder] Successfully got npm prefix: ${prefix}`);
        return prefix;
    } catch (error) {
        console.error('[npmFinder] Failed to execute npm config get prefix:', error);
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