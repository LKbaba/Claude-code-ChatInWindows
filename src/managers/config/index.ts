/**
 * Configuration Managers Export
 * Re-exports all configuration managers for easy import
 */

export { VsCodeConfigManager } from './VsCodeConfigManager';
export type { VsCodeSettings } from './VsCodeConfigManager';

export { McpConfigManager } from './McpConfigManager';
export type { McpStatus } from './McpConfigManager';

export { ApiConfigManager } from './ApiConfigManager';
export type { ApiConfig, WindowsConfig } from './ApiConfigManager';

// For backward compatibility, we can create a facade that combines all managers
export { ConfigurationManagerFacade } from './ConfigurationManagerFacade';