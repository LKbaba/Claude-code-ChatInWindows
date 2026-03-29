# updatePRDv2-PLAN — MCP 认证安全增强 开发计划

> 基于：`specs/updatePRDv2.md` v2.1 | 创建日期：2026-03-29 | 状态：**已完成**

---

## 任务总览

| # | 任务 | 文件 | 依赖 | 状态 |
|---|------|------|------|------|
| 1 | SecretService 扩展（Grok + Vertex AI） | `SecretService.ts` | 无 | [x] |
| 2 | package.json 配置声明 | `package.json` | 无 | [x] |
| 3 | UI 重构 — HTML 结构 | `getBodyContent.ts` | 无 | [x] |
| 4 | UI 重构 — 前端 JS | `ui-script.ts` | Task 3 | [x] |
| 5 | ClaudeChatProvider 消息处理 | `ClaudeChatProvider.ts` | Task 1 | [x] |
| 6 | McpConfigManager 注入逻辑 | `McpConfigManager.ts` | Task 1 | [x] |
| 7 | MCP 模板清理 | `ui-script.ts` | 无 | [x] |
| 8 | 编译验证 + 打包 | 全部 | Task 1-7 | [x] |

---

## Task 1：SecretService 扩展（Grok + Vertex AI）

**文件**：`src/services/SecretService.ts`

**AI 提示词**：

```
你是一位资深 TypeScript 后端开发专家，精通 VS Code Extension API 和安全存储模式。

请修改 `src/services/SecretService.ts`，在现有 Gemini 支持的基础上扩展 Grok 和 Vertex AI 凭据管理。

### 1. 新增常量

在 `SECRET_KEYS` 中添加：
- `GROK_API_KEY: 'grok-api-key'`
- `GROK_ENABLED: 'grok-integration-enabled'`
- `VERTEX_CREDENTIALS: 'gemini-vertex-credentials'`

在 `API_KEY_PROVIDERS` 中添加：
- `GROK: 'grok-api-key'`
- `VERTEX: 'gemini-vertex-credentials'`

在 `CONFIG_KEYS` 中添加：
- `GROK_ENABLED: 'claudeCodeChatUI.grokIntegrationEnabled'`
- `VERTEX_PROJECT: 'claudeCodeChatUI.gemini.vertexProject'`

### 2. 新增接口

```typescript
export interface GrokIntegrationConfig {
    enabled: boolean;
    apiKey: string | undefined;
}
```

### 3. 新增 Grok 方法区（参考现有 Gemini 方法的对称模式）

- `getGrokApiKey()` → 委托给 `getApiKey(SECRET_KEYS.GROK_API_KEY)`
- `setGrokApiKey(apiKey)` → 委托给 `setApiKey(SECRET_KEYS.GROK_API_KEY, apiKey)`
- `deleteGrokApiKey()` → 委托给 `deleteApiKey(SECRET_KEYS.GROK_API_KEY)`
- `getGrokIntegrationEnabled(): boolean` → 读 `CONFIG_KEYS.GROK_ENABLED`，默认 `false`
- `setGrokIntegrationEnabled(enabled: boolean)` → 写 VS Code config，`ConfigurationTarget.Global`
- `getGrokIntegrationConfig(): Promise<GrokIntegrationConfig>` → 返回 `{ enabled, apiKey }`
- `shouldInjectGrokApiKey(): Promise<boolean>` → `enabled && !!apiKey`

### 4. 新增 Vertex AI 方法区

- `getVertexCredentials(): Promise<string | undefined>` → `getApiKey(SECRET_KEYS.VERTEX_CREDENTIALS)`
- `setVertexCredentials(jsonString: string)` → `setApiKey(SECRET_KEYS.VERTEX_CREDENTIALS, jsonString)`
- `deleteVertexCredentials()` → `deleteApiKey(SECRET_KEYS.VERTEX_CREDENTIALS)`
- `getVertexProject(): string` → 读 `CONFIG_KEYS.VERTEX_PROJECT`，默认 `''`
- `setVertexProject(project: string)` → 写 VS Code config，`ConfigurationTarget.Global`
- `hasVertexCredentials(): Promise<boolean>` → `!!(await getVertexCredentials())`

### 5. 新增验证方法

- `static isValidGrokApiKeyFormat(apiKey: string): boolean` → 检查 `xai-` 前缀（宽松，不限长度）
- `static validateServiceAccountJson(json: string): { valid: boolean, error?: string, projectId?: string }` → 解析 JSON，检查必须字段 `type="service_account"`, `project_id`, `private_key`, `client_email`

### 6. 扩展 Gemini 配置返回

修改 `getGeminiIntegrationConfig()` 返回值，增加 `hasVertexCredentials` 和 `vertexProject` 字段：

```typescript
export interface GeminiIntegrationConfig {
    enabled: boolean;
    apiKey: string | undefined;
    hasVertexCredentials: boolean;   // 新增
    vertexProject: string;           // 新增
}
```

更新 `getGeminiIntegrationConfig()` 实现以填充新字段。

### 7. 扩展 shouldInjectGeminiApiKey

Rename to `shouldInjectGeminiCredentials()` 或保持原名但扩展逻辑：
- 当 `enabled && (!!apiKey || hasVertexCredentials)` 时返回 `true`

注意：代码注释用英文。保持现有代码风格。不改动 Anthropic 相关方法。
```

**完成标准**：
- [ ] 编译通过（`npm run compile`）
- [ ] `SECRET_KEYS` 包含 5 个常量
- [ ] `API_KEY_PROVIDERS` 包含 4 个 provider
- [ ] Grok 方法 7 个，Vertex AI 方法 6 个
- [ ] `GrokIntegrationConfig` 接口已导出
- [ ] `GeminiIntegrationConfig` 包含 `hasVertexCredentials` 和 `vertexProject`

---

## Task 2：package.json 配置声明

**文件**：`package.json`

**AI 提示词**：

```
你是一位 VS Code Extension 配置专家。

请修改 `package.json` 的 `contributes.configuration.properties` 区块，添加两个新的配置项。
插入位置：紧跟在现有的 `claudeCodeChatUI.geminiIntegrationEnabled` 之后。

添加内容：

1. `claudeCodeChatUI.grokIntegrationEnabled`
   - type: "boolean"
   - default: false
   - description: "Enable Grok Integration to automatically inject API key into grok-assistant MCP server"

2. `claudeCodeChatUI.gemini.vertexProject`
   - type: "string"
   - default: ""
   - description: "GCP Project ID extracted from imported Vertex AI Service Account JSON"

参考现有的 `claudeCodeChatUI.geminiIntegrationEnabled`（约 line 311-315）的格式。
```

**完成标准**：
- [ ] JSON 语法正确
- [ ] 两个新配置项在 `contributes.configuration.properties` 中

---

## Task 3：UI 重构 — HTML 结构

**文件**：`src/ui-v2/getBodyContent.ts`

**AI 提示词**：

```
ultrathink

你是一位资深前端开发专家，精通 VS Code Webview 开发和无障碍设计。

请修改 `src/ui-v2/getBodyContent.ts`，将现有的 "Gemini AI Assistant" 面板重构为统一的 "AI Assistant" 面板。

### 需要替换的区域

替换 line 432-460 的整个 Gemini 面板区块（从 `<h3>🦾 Gemini AI Assistant</h3>` 到最后一个 `</div>`）。

### 新的 HTML 结构

```html
<h3 style="margin-top: 24px; margin-bottom: 16px; font-size: 14px; font-weight: 600;">🤖 AI Assistant</h3>
<div>
    <p style="font-size: 11px; color: var(--vscode-descriptionForeground); margin: 0;">
        Securely manage your AI integration keys. When enabled, keys will be automatically injected into the corresponding MCP servers.
    </p>
</div>
<div class="settings-group">
    <!-- Gemini Sub-section -->
    <div class="tool-item">
        <input type="checkbox" id="gemini-enabled" onchange="toggleGeminiOptions()">
        <label for="gemini-enabled" style="font-weight: 600;">Gemini</label>
    </div>
    <div id="geminiOptions" style="margin-left: 24px; margin-top: 12px; display: none;">
        <!-- API Key (AI Studio) -->
        <div style="margin-bottom: 16px;">
            <label for="gemini-api-key" style="display: block; font-size: 12px; margin-bottom: 4px;">API Key (AI Studio)</label>
            <input type="password" id="gemini-api-key" placeholder="AIza..."
                style="width: 100%; padding: 6px 8px; font-size: 12px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px;"
                onchange="updateGeminiApiKey()">
            <p style="font-size: 11px; color: var(--vscode-descriptionForeground); margin: 4px 0 0 0;">
                🔒 Stored in VS Code SecretStorage.
                💡 Get your key from <a href="https://aistudio.google.com/apikey" style="color: var(--vscode-textLink-foreground);">Google AI Studio</a>
            </p>
        </div>
        <!-- Vertex AI Credentials (GCP Project) -->
        <div style="margin-bottom: 8px;">
            <label style="display: block; font-size: 12px; margin-bottom: 4px;">Vertex AI Credentials (GCP Project)</label>
            <button onclick="importVertexCredentials()"
                style="padding: 4px 12px; font-size: 12px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; border-radius: 4px; cursor: pointer;">
                📁 Import JSON Key File
            </button>
            <span id="vertex-status" style="margin-left: 8px; font-size: 11px; color: var(--vscode-descriptionForeground);">— Not imported</span>
            <p style="font-size: 11px; color: var(--vscode-descriptionForeground); margin: 4px 0 0 0;">
                💡 Export from <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" style="color: var(--vscode-textLink-foreground);">Google Cloud Console</a>: IAM → Service Accounts → Keys → Add Key → JSON
            </p>
        </div>
    </div>

    <!-- Grok Sub-section -->
    <div class="tool-item" style="margin-top: 12px;">
        <input type="checkbox" id="grok-enabled" onchange="toggleGrokOptions()">
        <label for="grok-enabled" style="font-weight: 600;">Grok</label>
    </div>
    <div id="grokOptions" style="margin-left: 24px; margin-top: 12px; display: none;">
        <div style="margin-bottom: 8px;">
            <label for="grok-api-key" style="display: block; font-size: 12px; margin-bottom: 4px;">Grok API Key</label>
            <input type="password" id="grok-api-key" placeholder="xai-..."
                style="width: 100%; padding: 6px 8px; font-size: 12px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px;"
                onchange="updateGrokApiKey()">
            <p style="font-size: 11px; color: var(--vscode-descriptionForeground); margin: 4px 0 0 0;">
                🔒 Stored in VS Code SecretStorage.
                💡 Get your key from <a href="https://console.x.ai/" style="color: var(--vscode-textLink-foreground);">console.x.ai</a>
            </p>
        </div>
    </div>
</div>
```

### 关键要求

1. 保持 `id="gemini-enabled"` 和 `id="gemini-api-key"` 不变（现有 JS 依赖这些 ID）
2. 新增 `id="grok-enabled"`、`id="grok-api-key"`、`id="grokOptions"`、`id="vertex-status"`
3. CSS 风格与现有面板一致（font-size、padding、color 变量）
4. 所有事件用 `onclick`/`onchange` 内联（CSP 限制，不能用 addEventListener）
5. Import 按钮使用 `var(--vscode-button-secondaryBackground)` 风格
6. 注释用英文
```

**完成标准**：
- [ ] `🤖 AI Assistant` 标题替换了 `🦾 Gemini AI Assistant`
- [ ] Gemini checkbox + API Key input + Import 按钮
- [ ] Grok checkbox + API Key input
- [ ] 所有 ID 正确：`gemini-enabled`、`gemini-api-key`、`grok-enabled`、`grok-api-key`、`geminiOptions`、`grokOptions`、`vertex-status`
- [ ] 无 CSP 违规（仅内联事件）

---

## Task 4：UI 重构 — 前端 JS

**文件**：`src/ui-v2/ui-script.ts`

**AI 提示词**：

```
ultrathink

你是一位资深前端开发专家，精通 VS Code Webview 中的 TypeScript 模板字符串嵌套。

**重要**：`ui-script.ts` 导出的是一段 JS 代码包裹在 TypeScript 模板字符串中。所有代码实际运行在浏览器环境。注意转义规则（参考 CLAUDE.md 的 "ui-script.ts Template Literal Nesting" 章节）。

请在 `src/ui-v2/ui-script.ts` 中做以下修改：

### 1. 新增 Grok 前端函数（参照现有 Gemini 函数的对称模式）

参考 `toggleGeminiOptions()`（~line 5144-5155），新增：

```javascript
function toggleGrokOptions() {
    const checkbox = document.getElementById('grok-enabled');
    const optionsDiv = document.getElementById('grokOptions');
    if (checkbox && optionsDiv) {
        const enabled = checkbox.checked;
        optionsDiv.style.display = enabled ? 'block' : 'none';
        vscode.postMessage({ type: 'updateGrokIntegration', enabled: enabled });
    }
}
```

参考 `updateGeminiApiKey()`（~line 5160-5181），新增：

```javascript
function updateGrokApiKey() {
    const input = document.getElementById('grok-api-key');
    if (!input) return;
    const apiKey = input.value.trim();
    if (apiKey && !apiKey.startsWith('xai-')) {
        console.warn('Grok API key should start with "xai-"');
    }
    vscode.postMessage({ type: 'updateGrokApiKey', apiKey: apiKey });
}
```

参考 `initGeminiIntegration(config)`（~line 5187-5202），新增：

```javascript
function initGrokIntegration(config) {
    const checkbox = document.getElementById('grok-enabled');
    const optionsDiv = document.getElementById('grokOptions');
    const apiKeyInput = document.getElementById('grok-api-key');
    if (checkbox) checkbox.checked = config.enabled;
    if (optionsDiv) optionsDiv.style.display = config.enabled ? 'block' : 'none';
    if (apiKeyInput && config.hasApiKey) {
        apiKeyInput.placeholder = config.maskedKey || 'xai-••••••••••••••••••••';
    }
}
```

### 2. 新增 Vertex AI Import 函数

```javascript
function importVertexCredentials() {
    vscode.postMessage({ type: 'importVertexCredentials' });
}
```

### 3. 扩展 initGeminiIntegration

在现有的 `initGeminiIntegration(config)` 中，添加 Vertex AI 状态更新：

```javascript
// After existing code...
const vertexStatus = document.getElementById('vertex-status');
if (vertexStatus) {
    if (config.hasVertexCredentials && config.vertexProject) {
        vertexStatus.textContent = '✅ Imported (project: ' + config.vertexProject + ')';
        vertexStatus.style.color = 'var(--vscode-testing-iconPassed)';
    } else {
        vertexStatus.textContent = '— Not imported';
        vertexStatus.style.color = 'var(--vscode-descriptionForeground)';
    }
}
```

### 4. 注册到 window 对象

在现有的 `window.toggleGeminiOptions = ...` 附近（~line 5421-5423），添加：

```javascript
window.toggleGrokOptions = toggleGrokOptions;
window.updateGrokApiKey = updateGrokApiKey;
window.initGrokIntegration = initGrokIntegration;
window.importVertexCredentials = importVertexCredentials;
```

### 5. 添加消息处理

在现有的 `geminiIntegrationConfig` 消息处理附近（~line 3367），添加：

```javascript
if (message.type === 'grokIntegrationConfig') {
    initGrokIntegration(message.data);
}
if (message.type === 'vertexCredentialsImported') {
    const vertexStatus = document.getElementById('vertex-status');
    if (vertexStatus && message.data) {
        if (message.data.success) {
            vertexStatus.textContent = '✅ Imported (project: ' + message.data.project + ')';
            vertexStatus.style.color = 'var(--vscode-testing-iconPassed)';
        } else {
            vertexStatus.textContent = '❌ ' + (message.data.error || 'Import failed');
            vertexStatus.style.color = 'var(--vscode-testing-iconFailed)';
        }
    }
}
```

### 关键注意

- 所有字符串在 TypeScript 模板字符串中需要正确转义
- `${}` 如果出现在 JS 代码中必须转义为 `\${}`
- 反引号在 JS 代码中必须转义为 `\``
- 保持与现有 Gemini 函数完全一致的代码风格
```

**完成标准**：
- [ ] 3 个 Grok 函数 + 1 个 Import 函数
- [ ] `initGeminiIntegration` 扩展了 Vertex AI 状态
- [ ] 4 个新函数注册到 `window`
- [ ] 2 个新消息处理（`grokIntegrationConfig`、`vertexCredentialsImported`）
- [ ] 编译通过

---

## ✅ 验收检查点 1：UI + SecretService 基础

完成 Task 1-4 后暂停，验收：
- [ ] `npm run compile` 编译通过零错误
- [ ] Extension Development Host 中 Settings 面板显示 "AI Assistant" 标题
- [ ] Gemini checkbox 展开后显示 API Key 输入 + Import 按钮
- [ ] Grok checkbox 展开后显示 API Key 输入
- [ ] 现有 Gemini API Key 功能不受影响（向后兼容）

---

## Task 5：ClaudeChatProvider 消息处理

**文件**：`src/providers/ClaudeChatProvider.ts`

**AI 提示词**：

```
ultrathink

你是一位资深 VS Code Extension 开发专家，精通 Webview 消息通信和 VS Code API。

请修改 `src/providers/ClaudeChatProvider.ts`，添加 Grok 和 Vertex AI 的消息处理。

### 1. 消息分发（switch/case）

在现有的 Gemini 消息分发（约 line 376-384）附近，添加 4 个新 case：

```typescript
case 'updateGrokIntegration':
    this._updateGrokIntegration(message.enabled);
    break;
case 'updateGrokApiKey':
    this._updateGrokApiKey(message.apiKey);
    break;
case 'getGrokIntegration':
    this._sendGrokIntegrationConfig();
    break;
case 'importVertexCredentials':
    this._importVertexCredentials();
    break;
```

### 2. Grok Handler 方法（参照 Gemini handler 的对称模式）

在 Gemini handler 方法区域之后（约 line 2098 之后），添加：

```typescript
// ==================== Grok Integration ====================

private async _updateGrokIntegration(enabled: boolean): Promise<void> {
    try {
        await secretService.setGrokIntegrationEnabled(enabled);
        if (enabled) {
            vscode.window.showInformationMessage('Grok Integration enabled. API key will be injected into grok-assistant MCP server.');
        }
        debugLog('ClaudeChatProvider', `Grok Integration ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
        debugError('ClaudeChatProvider', 'Failed to update Grok Integration', error);
    }
}

private async _updateGrokApiKey(apiKey: string): Promise<void> {
    try {
        if (apiKey && !SecretService.isValidGrokApiKeyFormat(apiKey)) {
            vscode.window.showWarningMessage('Grok API key format may be invalid. Expected format: xai-...');
        }
        await secretService.setGrokApiKey(apiKey);
        debugLog('ClaudeChatProvider', 'Grok API key updated');
        await this._sendGrokIntegrationConfig();
    } catch (error) {
        debugError('ClaudeChatProvider', 'Failed to update Grok API key', error);
    }
}

private async _sendGrokIntegrationConfig(): Promise<void> {
    try {
        const config = await secretService.getGrokIntegrationConfig();
        const maskedKey = SecretService.maskApiKey(config.apiKey);
        this._postMessageToWebview({
            type: 'grokIntegrationConfig',
            data: {
                enabled: config.enabled,
                hasApiKey: !!config.apiKey,
                maskedKey: maskedKey
            }
        });
    } catch (error) {
        debugError('ClaudeChatProvider', 'Failed to send Grok config', error);
    }
}
```

### 3. Vertex AI Import Handler

```typescript
// ==================== Vertex AI Import ====================

private async _importVertexCredentials(): Promise<void> {
    try {
        const fileUris = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectMany: false,
            filters: { 'JSON files': ['json'] },
            title: 'Select GCP Service Account JSON Key File'
        });

        if (!fileUris || fileUris.length === 0) {
            return; // User cancelled
        }

        const fileContent = await vscode.workspace.fs.readFile(fileUris[0]);
        const jsonString = Buffer.from(fileContent).toString('utf8');

        // Validate JSON
        const validation = SecretService.validateServiceAccountJson(jsonString);
        if (!validation.valid) {
            vscode.window.showErrorMessage(`Invalid Service Account JSON: ${validation.error}`);
            this._postMessageToWebview({
                type: 'vertexCredentialsImported',
                data: { success: false, error: validation.error }
            });
            return;
        }

        // Store credentials securely
        await secretService.setVertexCredentials(jsonString);
        await secretService.setVertexProject(validation.projectId!);

        vscode.window.showInformationMessage(
            `Vertex AI credentials imported successfully (project: ${validation.projectId})`
        );

        this._postMessageToWebview({
            type: 'vertexCredentialsImported',
            data: { success: true, project: validation.projectId }
        });

        // Refresh Gemini config to update vertex status in UI
        await this._sendGeminiIntegrationConfig();

        debugLog('ClaudeChatProvider', `Vertex AI credentials imported for project: ${validation.projectId}`);
    } catch (error) {
        debugError('ClaudeChatProvider', 'Failed to import Vertex AI credentials', error);
        vscode.window.showErrorMessage('Failed to import Vertex AI credentials.');
        this._postMessageToWebview({
            type: 'vertexCredentialsImported',
            data: { success: false, error: 'Import failed' }
        });
    }
}
```

### 4. 初始化时发送 Grok 配置

在现有的 `_sendGeminiIntegrationConfig()` 调用附近（约 line 443 的 `setTimeout` 块中），添加：

```typescript
this._sendGrokIntegrationConfig();
```

### 5. 扩展 _sendGeminiIntegrationConfig

修改现有的 `_sendGeminiIntegrationConfig()` 方法，在返回数据中增加 Vertex AI 状态：

```typescript
// Inside _sendGeminiIntegrationConfig, add to the data object:
hasVertexCredentials: config.hasVertexCredentials,
vertexProject: config.vertexProject
```

### 关键注意

- import `SecretService`（类，用于静态方法）和 `secretService`（实例）都需要可用
- `_postMessageToWebview` 是现有的辅助方法，直接使用
- 代码注释用英文
```

**完成标准**：
- [ ] 4 个新 case 在消息分发 switch 中
- [ ] 3 个 Grok handler 方法
- [ ] 1 个 Vertex AI Import handler（含文件选择、读取、验证、存储、状态回传）
- [ ] 初始化时发送 Grok 配置
- [ ] `_sendGeminiIntegrationConfig` 包含 `hasVertexCredentials` 和 `vertexProject`

---

## Task 6：McpConfigManager 注入逻辑

**文件**：`src/managers/config/McpConfigManager.ts`

**AI 提示词**：

```
ultrathink

你是一位资深 TypeScript 后端开发专家，精通 MCP 协议和安全凭据注入。

请修改 `src/managers/config/McpConfigManager.ts`，添加 Grok API Key 注入和 Gemini Vertex AI 凭据注入。

### 1. 新增 isGrokServer 方法（参照 isGeminiServer ~line 435-450）

```typescript
private isGrokServer(serverName: string, serverConfig: any): boolean {
    // Check server name
    if (serverName.toLowerCase().includes('grok')) {
        return true;
    }
    // Check args for grok-mcp package
    if (serverConfig.args && Array.isArray(serverConfig.args)) {
        const argsStr = serverConfig.args.join(' ');
        if (argsStr.includes('grok-mcp') || argsStr.includes('grok_mcp')) {
            return true;
        }
    }
    return false;
}
```

### 2. 新增 injectGrokApiKeyIfNeeded 方法（参照 injectGeminiApiKeyIfNeeded ~line 456-504）

```typescript
private async injectGrokApiKeyIfNeeded(mcpConfig: { mcpServers: { [key: string]: any } }): Promise<void> {
    try {
        const shouldInject = await secretService.shouldInjectGrokApiKey();
        if (!shouldInject) return;

        const apiKey = await secretService.getGrokApiKey();
        if (!apiKey) return;

        for (const [serverName, serverConfig] of Object.entries(mcpConfig.mcpServers)) {
            if (this.isGrokServer(serverName, serverConfig)) {
                if (!serverConfig.env) {
                    serverConfig.env = {};
                }
                serverConfig.env.XAI_API_KEY = apiKey;
                debugLog('McpConfigManager', `Injected Grok API key into server: ${serverName}`);
            }
        }
    } catch (error) {
        debugError('McpConfigManager', 'Failed to inject Grok API key', error);
    }
}
```

### 3. 扩展 injectGeminiApiKeyIfNeeded → Vertex AI 凭据注入

在现有的 `injectGeminiApiKeyIfNeeded()` 方法（~line 456-504）中，**在 API Key 注入之后**，添加 Vertex AI 凭据注入逻辑：

```typescript
// After existing API key injection loop...

// Inject Vertex AI credentials if available
const vertexCredentials = await secretService.getVertexCredentials();
if (vertexCredentials) {
    const vertexProject = secretService.getVertexProject();
    for (const [serverName, serverConfig] of Object.entries(mcpConfig.mcpServers)) {
        if (this.isGeminiServer(serverName, serverConfig)) {
            if (!serverConfig.env) {
                serverConfig.env = {};
            }
            serverConfig.env.GOOGLE_GENAI_USE_VERTEXAI = 'true';
            serverConfig.env.GOOGLE_CLOUD_PROJECT = vertexProject;
            serverConfig.env.GOOGLE_CLOUD_LOCATION = 'global';
            serverConfig.env.GOOGLE_CREDENTIALS_JSON = vertexCredentials;
            debugLog('McpConfigManager', `Injected Vertex AI credentials into server: ${serverName}`);
        }
    }
}
```

注意：API Key 和 Vertex AI 凭据**可以同时注入**。gemini-mcp server 端会优先使用 Vertex AI。

### 4. 在 buildMcpConfig 中调用新方法

在现有的 `await this.injectGeminiApiKeyIfNeeded(mcpConfig)`（约 line 296）之后，添加：

```typescript
await this.injectGrokApiKeyIfNeeded(mcpConfig);
```

### 关键注意

- `shouldInjectGeminiApiKey` 的条件需要更新：`enabled && (!!apiKey || hasVertexCredentials)`
  - 但这个改动在 Task 1 的 SecretService 中完成，这里只是调用方
- Vertex AI 注入不需要 `shouldInject` 单独检查——它在 `injectGeminiApiKeyIfNeeded` 内部，已经受 `shouldInjectGeminiApiKey` 保护
- 确保 import `secretService` 可用（已有）
- 代码注释用英文
```

**完成标准**：
- [ ] `isGrokServer()` 方法实现
- [ ] `injectGrokApiKeyIfNeeded()` 方法实现
- [ ] Vertex AI 凭据注入逻辑添加到现有 Gemini 方法中
- [ ] `buildMcpConfig()` 调用了 Grok 注入
- [ ] 编译通过

---

## Task 7：MCP 模板清理

**文件**：`src/ui-v2/ui-script.ts`

**AI 提示词**：

```
你是一位前端开发者。

请修改 `src/ui-v2/ui-script.ts` 中的 MCP server 模板定义。

找到 `gemini-assistant` 模板（约 line 5102-5112），将：
```javascript
'GEMINI_API_KEY': 'xxxxxxx'
```
改为：
```javascript
'GEMINI_API_KEY': ''  // Injected automatically when Gemini Integration is enabled
```

同时更新 Grok 模板的注释（约 line 5093-5101），将：
```javascript
'XAI_API_KEY': ''  // Get from https://console.x.ai/
```
改为：
```javascript
'XAI_API_KEY': ''  // Injected automatically when Grok Integration is enabled
```

保持其他内容不变。
```

**完成标准**：
- [ ] Gemini 模板 env 值从 `'xxxxxxx'` 改为 `''`
- [ ] 两个模板的注释都说明了 key 由 AI Assistant 面板自动注入

---

## ✅ 验收检查点 2：全功能验收

完成 Task 5-7 后，全面验收：

### 编译 & 打包
- [ ] `npm run compile` 零错误
- [ ] `cmd //c "npx @vscode/vsce package --no-dependencies"` 打包成功

### Grok 完整流程
- [ ] Settings 面板 → 勾选 Grok → 展开 API Key 输入
- [ ] 输入 `xai-xxx...` → Key 存入 SecretStorage（非明文）
- [ ] 启动新 Claude 会话 → grok-assistant MCP server 的 env 中有 `XAI_API_KEY`
- [ ] 取消勾选 Grok → 不注入 Key
- [ ] UI 显示 masked key（`xai-••••...`）

### Gemini Vertex AI 完整流程
- [ ] 勾选 Gemini → Import 按钮可见
- [ ] 点击 Import → 弹出系统文件选择器
- [ ] 选择合法 Service Account JSON → UI 显示 `✅ Imported (project: xxx)`
- [ ] 选择非法文件 → 显示错误
- [ ] 启动新会话 → gemini-assistant MCP server 的 env 中有 `GOOGLE_GENAI_USE_VERTEXAI=true` 等 4 个变量
- [ ] 向后兼容：原有 Gemini API Key 功能不受影响

### MCP 模板
- [ ] 添加 gemini-assistant 模板 → env 中 `GEMINI_API_KEY` 为空字符串
- [ ] 添加 grok-assistant 模板 → env 中 `XAI_API_KEY` 为空字符串

---

## Task 8：编译验证 + 版本 + 打包

**AI 提示词**：

```
你是一位 VS Code Extension 发布专家。

### 1. 编译
```bash
npm run compile
```

### 2. 如有编译错误，逐一修复

### 3. 更新版本号（如果需要）

检查 PRD 是否指定了新版本号。如果需要升版：
- `package.json` → `"version": "x.y.z"`
- `src/ui-v2/getBodyContent.ts` → 版本显示字符串
- `CHANGELOG.md` → 新版本条目

### 4. 打包

```bash
cmd //c "npx @vscode/vsce package --no-dependencies"
```

### 5. 验证产物

确认输出文件名格式为 `claude-code-chatui-{version}.vsix`。
```

**完成标准**：
- [ ] 编译零错误
- [ ] VSIX 文件生成
- [ ] 版本号一致（package.json、UI 显示、CHANGELOG）
