# Gemini Integration 实现计划

**项目名称：** Claude Code Chat - Gemini 集成功能
**PRD 文档：** [docs/updatePRD-gemini-integration.md](../docs/updatePRD-gemini-integration.md)
**创建日期：** 2025-11-26
**预计总工时：** 6-8 小时

---

## 📋 任务概览

| Task | 标题 | 预计时间 | 依赖 | 状态 |
|------|------|---------|------|------|
| 1 | 添加 Gemini 系统提示词 | 0.5h | 无 | ⏳ |
| 2 | 添加 Gemini MCP 模板 | 0.5h | 无 | ⏳ |
| 3 | 创建 SecretService 安全存储服务 | 1h | 无 | ⏳ |
| 4 | 添加 Gemini Integration UI | 1.5h | Task 3 | ⏳ |
| 5 | 实现 Webview 与 Extension 的消息通信 | 1h | Task 3, 4 | ⏳ |
| 6 | 实现 MCP 运行时 API Key 注入 | 1.5h | Task 3, 5 | ⏳ |
| 7 | 集成测试与调试 | 1h | Task 1-6 | ⏳ |

---

## 任务详情

### Task 1: 添加 Gemini 系统提示词

**预计时间**: 0.5 小时
**依赖**: 无
**涉及文件**: `src/utils/mcpPrompts.ts`

**AI 提示词**:

```
你是一位资深的 TypeScript 开发工程师，熟悉 VS Code 插件开发。

请在 Claude Code Chat 插件中添加 Gemini MCP 的系统提示词。

**任务要求**:
1. 修改文件 `e:\Github\Claude-code-ChatInWindows\src\utils\mcpPrompts.ts`
2. 在 `MCP_SYSTEM_PROMPTS` 对象中添加 `'gemini-assistant'` 键值对
3. 提示词内容需要：
   - 说明 Gemini 的用途（UI 生成、多模态分析、动画创建）
   - 列出核心工具：gemini_generate_ui, gemini_multimodal_query, gemini_fix_ui_from_screenshot, gemini_create_animation
   - 说明什么时候应该使用 Gemini（前端开发、设计稿转代码、截图分析等）
   - 明确 Gemini 是 Claude 的 AI 助手角色

**参考现有提示词格式**（如 sequential-thinking、context7 等），保持风格一致。

**提示词内容**:
```typescript
'gemini-assistant': `
## Gemini AI Assistant
**Purpose**: AI-powered UI generation, multimodal analysis, and creative coding
**Powered by**: Gemini 3.0 Pro (1M context, vision, thinking capabilities)

**Core Tools**:
- \`gemini_generate_ui\` - Generate HTML/CSS/JS from description or design image
- \`gemini_multimodal_query\` - Analyze images with natural language questions
- \`gemini_fix_ui_from_screenshot\` - Diagnose and fix UI issues from screenshots
- \`gemini_create_animation\` - Create Canvas/WebGL/CSS animations

**When to use Gemini**:
- UI/Frontend code generation (Gemini excels at WebDev)
- Converting design mockups to code (supports image input)
- Creating interactive animations and effects
- Analyzing screenshots or design images
- Large codebase analysis (1M token context)

**Usage pattern**:
1. For UI generation: Describe what you want or provide a design image
2. For debugging: Provide a screenshot of the issue
3. For animation: Describe the desired effect and technology (CSS/Canvas/WebGL)

**Note**: Gemini is Claude's AI assistant - use it for tasks where visual understanding or frontend expertise is needed.`
```

完成后，确保代码能通过 TypeScript 编译检查。
```

---

### Task 2: 添加 Gemini MCP 模板

**预计时间**: 0.5 小时
**依赖**: 无
**涉及文件**:
- `src/ui-v2/getBodyContent.ts`
- `src/ui-v2/ui-script.ts`

**AI 提示词**:

```
你是一位资深的 TypeScript 开发工程师，熟悉 VS Code 插件开发。

请在 Claude Code Chat 插件的 MCP 模板列表中添加 "Gemini Assistant" 选项。

**任务要求**:

1. **修改 `e:\Github\Claude-code-ChatInWindows\src\ui-v2\getBodyContent.ts`**
   - 找到 `<select id="mcpTemplateSelector">` 元素
   - 在 `shadcn/ui` 选项后面添加新选项：
   ```html
   <option value="gemini-assistant">Gemini Assistant</option>
   ```

2. **修改 `e:\Github\Claude-code-ChatInWindows\src\ui-v2\ui-script.ts`**
   - 找到 `addMcpFromTemplate()` 函数中的 `templates` 对象
   - 添加 Gemini 模板配置：
   ```typescript
   'gemini-assistant': {
       name: 'gemini-assistant',
       command: 'npx',
       args: ['-y', 'github:LKbaba/Gemini-mcp'],
       env: {
           'GEMINI_API_KEY': 'xxxxxxx'  // 占位符，提示用户需要配置
       }
   }
   ```

**注意事项**:
- 占位符 `'xxxxxxx'` 是故意设置的，用户需要在 Gemini Integration 区域填写真实密钥
- 保持与其他模板格式一致
- 添加适当的中文注释说明

完成后运行 `npm run build` 确保编译通过。
```

---

### Task 3: 创建 SecretService 安全存储服务

**预计时间**: 1 小时
**依赖**: 无
**涉及文件**:
- `src/services/SecretService.ts` (新建)
- `src/extension.ts` (修改，注册服务)

**AI 提示词**:

```
ultrathink

你是一位资深的 VS Code 插件开发工程师，精通 TypeScript 和 VS Code Extension API。

请为 Claude Code Chat 插件创建一个安全存储服务，用于管理 Gemini API Key。

**任务要求**:

1. **新建文件 `e:\Github\Claude-code-ChatInWindows\src\services\SecretService.ts`**

   实现以下功能：
   ```typescript
   import * as vscode from 'vscode';

   /**
    * SecretService - 安全存储服务
    * 使用 VS Code SecretStorage API 加密存储敏感信息
    */
   export class SecretService {
       private static readonly GEMINI_API_KEY = 'claude-code-chat.geminiApiKey';
       private static readonly GEMINI_ENABLED_KEY = 'geminiIntegrationEnabled';

       private context: vscode.ExtensionContext;
       private static instance: SecretService;

       private constructor(context: vscode.ExtensionContext) {
           this.context = context;
       }

       /**
        * 获取单例实例
        */
       public static getInstance(context?: vscode.ExtensionContext): SecretService {
           if (!SecretService.instance) {
               if (!context) {
                   throw new Error('SecretService 需要 ExtensionContext 进行初始化');
               }
               SecretService.instance = new SecretService(context);
           }
           return SecretService.instance;
       }

       /**
        * 获取 Gemini API Key
        */
       async getGeminiApiKey(): Promise<string | undefined> {
           return this.context.secrets.get(SecretService.GEMINI_API_KEY);
       }

       /**
        * 设置 Gemini API Key
        */
       async setGeminiApiKey(key: string): Promise<void> {
           await this.context.secrets.store(SecretService.GEMINI_API_KEY, key);
       }

       /**
        * 删除 Gemini API Key
        */
       async deleteGeminiApiKey(): Promise<void> {
           await this.context.secrets.delete(SecretService.GEMINI_API_KEY);
       }

       /**
        * 检查是否有 Gemini API Key
        */
       async hasGeminiApiKey(): Promise<boolean> {
           const key = await this.getGeminiApiKey();
           return !!key && key.length > 0;
       }

       /**
        * 获取 Gemini Integration 启用状态
        */
       isGeminiIntegrationEnabled(): boolean {
           const config = vscode.workspace.getConfiguration('claude-code-chat');
           return config.get<boolean>(SecretService.GEMINI_ENABLED_KEY, false);
       }

       /**
        * 设置 Gemini Integration 启用状态
        */
       async setGeminiIntegrationEnabled(enabled: boolean): Promise<void> {
           const config = vscode.workspace.getConfiguration('claude-code-chat');
           await config.update(SecretService.GEMINI_ENABLED_KEY, enabled, vscode.ConfigurationTarget.Global);
       }
   }
   ```

2. **修改 `e:\Github\Claude-code-ChatInWindows\package.json`**

   在 `contributes.configuration.properties` 中添加：
   ```json
   "claude-code-chat.geminiIntegrationEnabled": {
       "type": "boolean",
       "default": false,
       "description": "Enable Gemini Integration to securely inject API key into gemini-assistant MCP"
   }
   ```

3. **修改 `e:\Github\Claude-code-ChatInWindows\src\extension.ts`**

   在 `activate` 函数中初始化 SecretService：
   ```typescript
   import { SecretService } from './services/SecretService';

   // 在 activate 函数开头初始化
   SecretService.getInstance(context);
   ```

**注意事项**:
- 使用单例模式确保全局只有一个实例
- API Key 使用 SecretStorage 加密存储，不会出现在 settings.json 中
- 启用状态使用普通配置存储即可

完成后运行 `npm run build` 确保编译通过。
```

---

### Task 4: 添加 Gemini Integration UI

**预计时间**: 1.5 小时
**依赖**: Task 3
**涉及文件**:
- `src/ui-v2/getBodyContent.ts`
- `src/ui-v2/ui-script.ts`

**AI 提示词**:

```
ultrathink

你是一位资深的前端开发工程师，熟悉 VS Code Webview 开发。

请在 Claude Code Chat 插件的 Settings 页面添加 Gemini Integration 配置区域。

**任务要求**:

1. **修改 `e:\Github\Claude-code-ChatInWindows\src\ui-v2\getBodyContent.ts`**

   在 MCP Configuration 区域和 API Configuration 区域之间，插入 Gemini Integration HTML：

   ```html
   <h3 style="margin-top: 24px; margin-bottom: 16px; font-size: 14px; font-weight: 600;">
       🤖 Gemini AI Assistant
   </h3>
   <div>
       <p style="font-size: 11px; color: var(--vscode-descriptionForeground); margin: 0;">
           Securely manage your Gemini API key. When enabled, this key will be automatically injected into the gemini-assistant MCP.
       </p>
   </div>
   <div class="settings-group">
       <div class="tool-item">
           <input type="checkbox" id="gemini-enabled" onchange="toggleGeminiOptions()">
           <label for="gemini-enabled">Enable Gemini Integration</label>
       </div>

       <div id="geminiOptions" style="margin-left: 24px; margin-top: 12px; display: none;">
           <div style="margin-bottom: 12px;">
               <label for="gemini-api-key" style="display: block; font-size: 12px; margin-bottom: 4px;">Gemini API Key</label>
               <input type="password" id="gemini-api-key" placeholder="AIza..."
                   style="width: 100%; padding: 6px 8px; font-size: 12px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px;"
                   onchange="updateGeminiApiKey()">
           </div>
           <div style="padding: 8px; background: rgba(255, 255, 255, 0.05); border-radius: 4px;">
               <p style="font-size: 11px; color: var(--vscode-descriptionForeground); margin: 0;">
                   🔒 Your API key will be stored securely in VS Code settings.
               </p>
               <p style="font-size: 11px; color: var(--vscode-descriptionForeground); margin: 4px 0 0 0;">
                   💡 Get your free key from <a href="https://aistudio.google.com/apikey" style="color: var(--vscode-textLink-foreground);">Google AI Studio</a>
               </p>
           </div>
       </div>
   </div>
   ```

2. **修改 `e:\Github\Claude-code-ChatInWindows\src\ui-v2\ui-script.ts`**

   添加以下函数：

   ```typescript
   // Gemini Integration 相关函数
   function toggleGeminiOptions() {
       const geminiEnabled = document.getElementById('gemini-enabled').checked;
       const geminiOptions = document.getElementById('geminiOptions');

       if (geminiOptions) {
           geminiOptions.style.display = geminiEnabled ? 'block' : 'none';
       }

       // 发送启用状态到 Extension
       vscode.postMessage({
           type: 'setGeminiIntegrationEnabled',
           enabled: geminiEnabled
       });
   }

   function updateGeminiApiKey() {
       const apiKeyInput = document.getElementById('gemini-api-key');
       const apiKey = apiKeyInput?.value || '';

       if (apiKey) {
           // 发送 API Key 到 Extension 安全存储
           vscode.postMessage({
               type: 'setGeminiApiKey',
               apiKey: apiKey
           });

           // 清空输入框并显示掩码提示
           apiKeyInput.value = '';
           apiKeyInput.placeholder = 'AIza••••••••••••••••••••••••••••';
       }
   }

   // 初始化 Gemini Integration 状态
   function initGeminiIntegration(enabled, hasApiKey) {
       const geminiEnabledCheckbox = document.getElementById('gemini-enabled');
       const geminiOptions = document.getElementById('geminiOptions');
       const apiKeyInput = document.getElementById('gemini-api-key');

       if (geminiEnabledCheckbox) {
           geminiEnabledCheckbox.checked = enabled;
       }

       if (geminiOptions) {
           geminiOptions.style.display = enabled ? 'block' : 'none';
       }

       if (apiKeyInput && hasApiKey) {
           apiKeyInput.placeholder = 'AIza••••••••••••••••••••••••••••';
       }
   }
   ```

3. **在 `window` 对象上暴露这些函数**

   找到暴露全局函数的位置，添加：
   ```typescript
   window.toggleGeminiOptions = toggleGeminiOptions;
   window.updateGeminiApiKey = updateGeminiApiKey;
   window.initGeminiIntegration = initGeminiIntegration;
   ```

**注意事项**:
- API Key 输入框使用 `type="password"` 隐藏输入
- 保存后清空输入框，用掩码占位符提示用户已保存
- 保持与现有 UI 风格一致

完成后运行 `npm run build` 确保编译通过。
```

---

### Task 5: 实现 Webview 与 Extension 的消息通信

**预计时间**: 1 小时
**依赖**: Task 3, Task 4
**涉及文件**:
- `src/providers/ClaudeChatProvider.ts`

**AI 提示词**:

```
ultrathink

你是一位资深的 VS Code 插件开发工程师，精通 Webview 消息通信机制。

请在 Claude Code Chat 插件中实现 Webview 与 Extension 之间的 Gemini Integration 消息通信。

**任务要求**:

修改 `e:\Github\Claude-code-ChatInWindows\src\providers\ClaudeChatProvider.ts`

1. **导入 SecretService**
   ```typescript
   import { SecretService } from '../services/SecretService';
   ```

2. **在消息处理逻辑中添加 Gemini Integration 相关处理**

   找到处理 webview 消息的位置（通常是 `webview.onDidReceiveMessage`），添加：

   ```typescript
   case 'setGeminiIntegrationEnabled':
       // 设置 Gemini Integration 启用状态
       const secretService = SecretService.getInstance();
       await secretService.setGeminiIntegrationEnabled(message.enabled);
       console.log('[Gemini Integration] Enabled:', message.enabled);
       break;

   case 'setGeminiApiKey':
       // 安全存储 Gemini API Key
       const secretSvc = SecretService.getInstance();
       await secretSvc.setGeminiApiKey(message.apiKey);
       console.log('[Gemini Integration] API Key saved securely');

       // 通知 webview 保存成功
       this._view?.webview.postMessage({
           type: 'geminiApiKeySaved',
           success: true
       });
       break;

   case 'getGeminiIntegrationStatus':
       // 获取 Gemini Integration 状态
       const svc = SecretService.getInstance();
       const enabled = svc.isGeminiIntegrationEnabled();
       const hasApiKey = await svc.hasGeminiApiKey();

       this._view?.webview.postMessage({
           type: 'geminiIntegrationStatus',
           enabled: enabled,
           hasApiKey: hasApiKey
       });
       break;
   ```

3. **在 Webview 初始化时发送 Gemini Integration 状态**

   找到 webview 初始化或 resolveWebviewView 的位置，添加获取状态的逻辑：

   ```typescript
   // 发送 Gemini Integration 初始状态
   const secretService = SecretService.getInstance();
   const geminiEnabled = secretService.isGeminiIntegrationEnabled();
   const hasGeminiKey = await secretService.hasGeminiApiKey();

   webviewView.webview.postMessage({
       type: 'geminiIntegrationStatus',
       enabled: geminiEnabled,
       hasApiKey: hasGeminiKey
   });
   ```

4. **在 ui-script.ts 中处理来自 Extension 的消息**

   修改 `e:\Github\Claude-code-ChatInWindows\src\ui-v2\ui-script.ts`，在消息监听器中添加：

   ```typescript
   case 'geminiIntegrationStatus':
       initGeminiIntegration(message.enabled, message.hasApiKey);
       break;

   case 'geminiApiKeySaved':
       if (message.success) {
           console.log('[Gemini] API Key saved successfully');
       }
       break;
   ```

**注意事项**:
- 确保 SecretService 已正确初始化
- 消息类型使用清晰的命名
- 添加适当的日志输出便于调试

完成后运行 `npm run build` 确保编译通过。
```

---

### Task 6: 实现 MCP 运行时 API Key 注入

**预计时间**: 1.5 小时
**依赖**: Task 3, Task 5
**涉及文件**:
- `src/providers/ClaudeChatProvider.ts` 或 MCP 相关服务文件

**AI 提示词**:

```
ultrathink

你是一位资深的 VS Code 插件开发工程师，熟悉 MCP (Model Context Protocol) 实现。

请在 Claude Code Chat 插件中实现 Gemini API Key 的运行时注入功能。

**任务背景**:
当用户启用 Gemini Integration 并填写了 API Key 后，在启动 MCP 进程时需要动态将 API Key 注入到环境变量中，覆盖 MCP 配置中的占位符。

**任务要求**:

1. **找到 MCP 进程启动的位置**

   在项目中搜索 MCP 服务器启动相关的代码，可能在：
   - `src/providers/ClaudeChatProvider.ts`
   - 或专门的 MCP 服务文件

2. **添加 Gemini 服务器识别函数**

   ```typescript
   /**
    * 判断是否是 Gemini MCP 服务器
    */
   function isGeminiServer(config: { name: string; args?: string[] }): boolean {
       const name = config.name.toLowerCase();
       const argsStr = config.args?.join(' ').toLowerCase() || '';

       return name.includes('gemini') ||
              argsStr.includes('gemini-mcp') ||
              argsStr.includes('lkbaba/gemini');
   }
   ```

3. **在启动 MCP 进程时注入 API Key**

   找到启动 MCP 进程的代码（通常使用 `child_process.spawn`），在构建环境变量时添加：

   ```typescript
   import { SecretService } from '../services/SecretService';

   // 在启动 MCP 服务器的函数中
   async function startMcpServer(config: McpServerConfig) {
       // 准备环境变量
       let env = { ...process.env, ...config.env };

       // 检查是否需要注入 Gemini API Key
       if (isGeminiServer(config)) {
           const secretService = SecretService.getInstance();
           const integrationEnabled = secretService.isGeminiIntegrationEnabled();

           if (integrationEnabled) {
               const apiKey = await secretService.getGeminiApiKey();
               if (apiKey) {
                   env.GEMINI_API_KEY = apiKey;
                   console.log('[MCP] Injected Gemini API key from Integration');
               }
           }
       }

       // 启动进程时使用修改后的 env
       const proc = spawn(config.command, config.args, {
           env,
           // ... 其他选项
       });
   }
   ```

4. **处理边界情况**

   - 如果 Integration 未启用，使用 MCP 配置中的原始环境变量
   - 如果 Integration 启用但没有填写 Key，使用 MCP 配置中的原始环境变量
   - 如果 Integration 启用且有 Key，覆盖 MCP 配置中的 `GEMINI_API_KEY`

**参考文件**:
- PRD 文档: `e:\Github\Claude-code-ChatInWindows\docs\updatePRD-gemini-integration.md`

**注意事项**:
- 不要修改 MCP 配置的存储，只在运行时注入
- 添加清晰的日志便于调试
- 确保不会影响其他 MCP 服务器的启动

完成后运行 `npm run build` 确保编译通过，并手动测试 MCP 启动流程。
```

---

### Task 7: 集成测试与调试

**预计时间**: 1 小时
**依赖**: Task 1-6
**涉及文件**: 无新增

**AI 提示词**:

```
你是一位资深的 QA 工程师，熟悉 VS Code 插件测试。

请帮我测试 Claude Code Chat 插件的 Gemini Integration 功能。

**测试环境准备**:
1. 确保已完成所有代码修改
2. 运行 `npm run build` 编译项目
3. 在 VS Code 中按 F5 启动调试

**测试用例**:

### 测试 1: 系统提示词
1. 在 MCP 配置中添加 gemini-assistant
2. 开始新对话
3. 验证系统提示词是否包含 "Gemini AI Assistant" 相关内容

### 测试 2: MCP 模板
1. 打开 Settings 页面
2. 点击 "Add from template..." 下拉菜单
3. 验证是否有 "Gemini Assistant" 选项
4. 选择该模板，验证配置是否正确填充：
   - Name: gemini-assistant
   - Command: npx
   - Args: -y github:LKbaba/Gemini-mcp
   - Environment Variables: {"GEMINI_API_KEY":"xxxxxxx"}

### 测试 3: Gemini Integration UI
1. 打开 Settings 页面
2. 找到 "🤖 Gemini AI Assistant" 区域
3. 勾选 "Enable Gemini Integration"
4. 验证 API Key 输入框显示
5. 输入测试密钥 "AIzaTestKey123"
6. 验证输入框清空并显示掩码占位符

### 测试 4: API Key 注入
1. 从模板添加 Gemini Assistant MCP（使用占位符）
2. 在 Gemini Integration 区域填写真实 API Key
3. 点击 "Test Connection"
4. 检查控制台日志，验证：
   - `[MCP] Injected Gemini API key from Integration`
5. 验证 MCP 连接成功

### 测试 5: 不启用 Integration 的情况
1. 取消勾选 "Enable Gemini Integration"
2. 在 MCP 配置中手动填写真实 API Key
3. 点击 "Test Connection"
4. 验证 MCP 使用手动填写的 Key 连接成功

### 测试 6: 边界情况
1. 启用 Integration 但不填写 Key → 应使用 MCP 配置中的 Key
2. 启用 Integration 且两边都有 Key → 应使用 Integration 的 Key
3. 启用 Integration 但 MCP 列表中没有 Gemini → 不报错，自动忽略

**调试技巧**:
- 打开 VS Code 开发者工具 (Help > Toggle Developer Tools)
- 查看 Console 标签页的日志输出
- 搜索 `[Gemini]` 或 `[MCP]` 相关日志

如果发现问题，请描述具体的错误信息和复现步骤。
```

---

## 📝 提交规范

每个 Task 完成后，使用以下格式提交：

```bash
git add .
git commit -m "feat(gemini): [Task N 描述]

- 具体修改点 1
- 具体修改点 2

Refs: docs/updatePRD-gemini-integration.md"
```

示例：
```bash
git commit -m "feat(gemini): add Gemini system prompt for MCP

- Add gemini-assistant entry to MCP_SYSTEM_PROMPTS
- Include core tools and usage patterns

Refs: docs/updatePRD-gemini-integration.md"
```

---

## 🔗 相关文档

- [PRD 文档](../docs/updatePRD-gemini-integration.md)
- [Gemini MCP 项目](https://github.com/LKbaba/Gemini-mcp)
- [VS Code Extension API](https://code.visualstudio.com/api)
- [VS Code SecretStorage API](https://code.visualstudio.com/api/references/vscode-api#SecretStorage)

---

**文档状态**: 📝 已完成
**创建时间**: 2025-11-26

---

*Generated for Claude Code implementation*
