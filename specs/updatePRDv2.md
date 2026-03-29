# updatePRDv2 — MCP 认证安全增强

> 版本：v2.1 | 创建日期：2026-03-29 | 状态：**草案**

## 1. 背景与动机

### 1.1 Gemini MCP 认证变化

`@lkbaba/mcp-server-gemini` v1.4.0 新增了 **Vertex AI 双模式认证**（commit `a31323c`）：

| 模式 | 环境变量 | 适用场景 |
|------|---------|---------|
| **AI Studio API Key** | `GEMINI_API_KEY` | 个人开发、快速试用 |
| **Vertex AI Service Account** | 多个字段（见下方） | 生产环境、企业使用 |

Vertex AI 模式支持 3 种凭据传递方式（优先级从高到低）：

1. **显式模式**：`GOOGLE_GENAI_USE_VERTEXAI=true` + `GOOGLE_CLOUD_PROJECT` + `GOOGLE_CREDENTIALS_JSON`
2. **Raw JSON 粘贴**：将 Service Account JSON 的所有 key-value 直接放入 MCP env（自动检测 `type=service_account`）
3. **API Key 回退**：仅设 `GEMINI_API_KEY`

**问题**：当前扩展的 Gemini 设置 UI 只支持 API Key 模式（一个 `AIza...` 输入框）。用户无法通过 GUI 配置 Vertex AI 认证。如果用户只使用 Vertex AI 而没有 API Key，现有的 `shouldInjectGeminiApiKey()` 逻辑也不适用。

### 1.2 Grok MCP 密钥明文问题

`@lkbaba/grok-mcp` 的 `XAI_API_KEY` 目前直接存储在 VS Code 的 `settings.json` 的 MCP server env 配置中（明文），任何能读取配置文件的程序都能获取密钥。

**对比**：Gemini 的 API Key 已经通过 `SecretService` + VS Code `SecretStorage` 安全存储，运行时由 `McpConfigManager.injectGeminiApiKeyIfNeeded()` 动态注入。Grok 应该采用相同的架构。

### 1.3 当前 UI 与目标

**当前**：独立的 "Gemini AI Assistant" 面板，仅支持 API Key。

**目标**：统一为 "AI Assistant" 区块，内含 Gemini（API Key + Vertex AI 导入）和 Grok（API Key）两个子项。

---

## 2. 需求概述

### 2.1 UI 重构：统一 "AI Assistant" 面板

**目标**：将现有 "Gemini AI Assistant" 重构为统一的 "AI Assistant" 区块，内含 Gemini 和 Grok 两个子项。

#### 整体布局

原来的 `🦾 Gemini AI Assistant` 标题改为 `🤖 AI Assistant`，描述文字改为通用。下方不再只有一个 checkbox，而是两个平级的 checkbox 子项（Gemini、Grok），各自展开后显示对应的配置表单。

### 2.2 Gemini 子项（扩展现有功能）

勾选 Gemini 后展开两部分：

1. **API Key 输入**（保持现有行为）：
   - 输入框：`AIza...` 格式的 API Key
   - 存储：`SecretService` → VS Code `SecretStorage`
   - 注入：`McpConfigManager.injectGeminiApiKeyIfNeeded()` → `env.GEMINI_API_KEY`

2. **Import Vertex AI Credentials 按钮**（新增）：
   - 点击后触发 `vscode.window.showOpenDialog()`，弹出系统文件选择器
   - 用户选择 GCP Service Account JSON key 文件（如 `vertex-ai-491703-*.json`）
   - Extension host 读取文件内容、验证 JSON 格式（必须包含 `type: "service_account"` + `project_id` + `private_key`）
   - 验证通过后：
     - 整个 JSON 字符串存入 `SecretService`（key: `gemini-vertex-credentials`）
     - 从 JSON 中提取 `project_id` 存入 VS Code config（`claudeCodeChatUI.gemini.vertexProject`）
   - UI 显示导入状态：`✅ Imported (project: vertex-ai-491703)` 或 `⚠️ Not imported`
   - 注入逻辑：`McpConfigManager` 构建 MCP config 时，如果有 Vertex AI 凭据，注入：
     ```
     GOOGLE_GENAI_USE_VERTEXAI: "true"
     GOOGLE_CLOUD_PROJECT: <from JSON project_id>
     GOOGLE_CLOUD_LOCATION: "global"
     GOOGLE_CREDENTIALS_JSON: <entire JSON string from SecretStorage>
     ```

   **注入优先级**：如果用户同时配置了 API Key 和 Vertex AI 凭据，**两者都注入**，由 gemini-mcp server 端决定优先使用哪个（server 端优先 Vertex AI）。

   **文件选择器配置**：
   ```typescript
   vscode.window.showOpenDialog({
     canSelectFiles: true,
     canSelectMany: false,
     filters: { 'JSON files': ['json'] },
     title: 'Select GCP Service Account JSON Key File'
   })
   ```

### 2.3 Grok 子项（新增）

勾选 Grok 后展开：

1. **API Key 输入**（与 Gemini API Key 同样模式）：
   - 输入框：`xai-...` 格式的 API Key
   - 存储：`SecretService` → VS Code `SecretStorage`（key: `grok-api-key`）
   - 注入：`McpConfigManager.injectGrokApiKeyIfNeeded()` → `env.XAI_API_KEY`

2. **SecretService 扩展**：
   - 新增常量：`SECRET_KEYS.GROK_API_KEY = 'grok-api-key'`
   - 新增 provider：`API_KEY_PROVIDERS.GROK = 'grok-api-key'`
   - 新增 VS Code config：`claudeCodeChatUI.grokIntegrationEnabled`（boolean）
   - Key 格式验证：`xai-` 前缀（宽松验证，不限长度）

3. **McpConfigManager 注入**：
   - 新增 `injectGrokApiKeyIfNeeded()`
   - Server 识别规则：name 包含 `"grok"`（case-insensitive），或 args 包含 `"grok-mcp"` / `"grok_mcp"`
   - 注入 `env.XAI_API_KEY` = SecretStorage 中的值

4. **消息处理（ClaudeChatProvider）**：
   - 新增 message type：`updateGrokIntegration`、`updateGrokApiKey`、`getGrokIntegration`
   - Handler 逻辑与 Gemini 对称

#### 不做的事情

- 不从现有 MCP config 中自动迁移明文 `XAI_API_KEY` — 用户需手动在 UI 中重新输入
- 不删除用户 MCP config 中已有的 `XAI_API_KEY`（只是覆盖注入）
- 不支持 ADC（Application Default Credentials）的本机 `gcloud auth` 流程
- 不修改 `@lkbaba/mcp-server-gemini` 或 `@lkbaba/grok-mcp` 本身

---

## 3. 技术设计

### 3.1 数据流

#### Gemini API Key（现有，不变）
```
User enters API key in UI → postMessage { type: 'updateGeminiApiKey', apiKey }
  → ClaudeChatProvider → secretService.setGeminiApiKey(apiKey)
  → On CLI invocation: McpConfigManager injects env.GEMINI_API_KEY
```

#### Gemini Vertex AI 导入（新增）
```
User clicks "Import Vertex AI Credentials" button
  → ui-script.ts postMessage { type: 'importVertexCredentials' }
  → ClaudeChatProvider receives message
  → vscode.window.showOpenDialog({ filters: { 'JSON': ['json'] } })
  → User selects file → fs.readFile()
  → Validate JSON: must contain type="service_account" + project_id + private_key
  → secretService.setApiKey('gemini-vertex-credentials', jsonString)
  → vscode.config.update('claudeCodeChatUI.gemini.vertexProject', json.project_id)
  → postMessage back to webview { type: 'vertexCredentialsImported', project: '...' }
  → UI updates status display

On Claude CLI invocation:
  → McpConfigManager.buildMcpConfig()
  → injectGeminiCredentialsIfNeeded()
  → if vertex credentials exist: inject GOOGLE_GENAI_USE_VERTEXAI, PROJECT, LOCATION, CREDENTIALS_JSON
  → if API key exists: inject GEMINI_API_KEY (can coexist — server decides priority)
```

#### Grok API Key 安全注入（新增）
```
User enters XAI API key in UI
  → ui-script.ts validates 'xai-' prefix
  → postMessage { type: 'updateGrokApiKey', apiKey }
  → ClaudeChatProvider → secretService.setApiKey('grok-api-key', apiKey)

On Claude CLI invocation:
  → McpConfigManager.buildMcpConfig()
  → injectGrokApiKeyIfNeeded()
  → finds servers matching 'grok' pattern
  → injects env.XAI_API_KEY from SecretStorage
```

### 3.2 涉及文件

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/services/SecretService.ts` | 修改 | 新增 Grok 方法、Vertex AI 凭据存储、认证模式配置 |
| `src/managers/config/McpConfigManager.ts` | 修改 | 新增 `injectGrokApiKeyIfNeeded()`，重构 Gemini 注入支持双模式 |
| `src/providers/ClaudeChatProvider.ts` | 修改 | 新增 Grok 和 Vertex AI 相关 message handler |
| `src/ui-v2/getBodyContent.ts` | 修改 | Gemini 面板增加模式选择器 + Vertex AI 字段；新增 Grok 面板 |
| `src/ui-v2/ui-script.ts` | 修改 | Gemini 模式切换 JS、Grok toggle/key handler、初始化逻辑 |
| `package.json` | 修改 | 新增 `claudeCodeChatUI.grokIntegrationEnabled` 和 Vertex AI 相关 config 定义 |

### 3.3 VS Code Configuration 新增项

```json
{
  "claudeCodeChatUI.grokIntegrationEnabled": {
    "type": "boolean",
    "default": false,
    "description": "Enable Grok API key injection into grok-assistant MCP server"
  },
  "claudeCodeChatUI.gemini.vertexProject": {
    "type": "string",
    "default": "",
    "description": "GCP Project ID extracted from imported Service Account JSON"
  }
}
```

> 注意：不再需要 `authMode` 和 `vertexLocation`。API Key 和 Vertex AI 可以共存，Location 固定为 `"global"`。

### 3.4 SecretStorage Keys

| Key | 内容 | 格式 |
|-----|------|------|
| `gemini-api-key` | Gemini AI Studio API Key | `AIza...`（已有） |
| `gemini-vertex-credentials` | GCP Service Account JSON | 完整 JSON 字符串（新增） |
| `grok-api-key` | Grok/xAI API Key | `xai-...`（新增） |

---

## 4. UI 设计

### 4.1 整体布局

```
🤖 AI Assistant
Securely manage your AI integration keys. When enabled, keys will
be automatically injected into the corresponding MCP servers.

┌─────────────────────────────────────────────────────┐
│ ☐ Gemini                                            │
│                                                     │
│   (勾选后展开 ↓)                                     │
│                                                     │
│   API Key (AI Studio)                                │
│   [AIza••••••••••••••••••••]  (password input)      │
│   🔒 Stored in VS Code SecretStorage                │
│   💡 Get your key from Google AI Studio              │
│      (aistudio.google.com/apikey)                   │
│                                                     │
│   Vertex AI Credentials (GCP Project)               │
│   [📁 Import JSON Key File]  (button)               │
│   Status: ✅ Imported (project: vertex-ai-491703)   │
│      or:  — Not imported                            │
│   💡 Export from Google Cloud Console:               │
│      IAM → Service Accounts → Keys → Add Key → JSON │
│      (console.cloud.google.com)                     │
│                                                     │
├─────────────────────────────────────────────────────┤
│ ☐ Grok                                              │
│                                                     │
│   (勾选后展开 ↓)                                     │
│                                                     │
│   Grok API Key                                      │
│   [xai-••••••••••••••••••••]  (password input)      │
│   🔒 Stored in VS Code SecretStorage                │
│   💡 Get your key from console.x.ai                 │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 4.2 交互细节

**Gemini checkbox**：
- 勾选 → 展开 API Key 输入 + Vertex AI Import 区域
- 取消 → 折叠，运行时不注入任何 Gemini 凭据
- 对应 message：`updateGeminiIntegration`（已有）

**Grok checkbox**：
- 勾选 → 展开 API Key 输入
- 取消 → 折叠，运行时不注入 Grok API Key
- 对应 message：`updateGrokIntegration`（新增）

**Import 按钮**：
- 点击 → postMessage `{ type: 'importVertexCredentials' }` → extension host
- Host 调用 `vscode.window.showOpenDialog()` → 选择 `.json` 文件
- 读取 + 验证 → 存入 SecretStorage → postMessage 回 webview 更新状态
- 已导入时显示 project ID；未导入时显示 "— Not imported"

**初始化**：
- 页面加载时 → postMessage `{ type: 'getGeminiIntegration' }` + `{ type: 'getGrokIntegration' }`
- Extension host 返回各自的 config（enabled, hasApiKey, maskedKey, hasVertexCredentials, vertexProject）

### 4.3 UI 注意事项

- 两个子项使用相同的 HTML/CSS 风格，缩进对齐
- 密码框显示 masked key（前 4 字符 + `••••`）
- checkbox label 直接用 "Gemini" / "Grok"（简洁）
- 遵守 CSP 规则：所有事件使用 `onclick`/`onchange` 内联（与现有模式一致）
- Import 按钮样式与现有 MCP 模板添加按钮一致

---

## 5. 实施阶段

### Phase 1：UI 重构 + Grok 安全存储 + Vertex AI 导入（一次性交付）

由于三个变更共享 UI 框架，拆分反而增加合并成本。建议一次交付。

**任务分解**：

1. **UI 重构**：`getBodyContent.ts` 标题改 "AI Assistant"，结构改为两个 checkbox 子项
2. **Grok SecretService**：新增常量、方法、config 声明（`package.json`）
3. **Grok UI**：checkbox + API Key 输入框 + 前端 JS handler
4. **Grok 注入**：`McpConfigManager.injectGrokApiKeyIfNeeded()`
5. **Grok 消息处理**：`ClaudeChatProvider` 三个新 message type
6. **Vertex AI Import**：
   - `ClaudeChatProvider` 处理 `importVertexCredentials` → `showOpenDialog` → 读取验证 → 存储
   - 前端 Import 按钮 + 状态显示 + 初始化逻辑
7. **Vertex AI 注入**：`McpConfigManager` 注入 Vertex AI 环境变量
8. **MCP 模板清理**：Gemini 模板的 `GEMINI_API_KEY: 'xxxxxxx'` 改为 `''`（与 Grok 一致），注释说明 key 由 AI Assistant 面板安全注入
9. **编译验证 + 打包**

**预计改动量**：~400-500 行新增/修改

---

## 6. 风险与约束

| 风险 | 影响 | 缓解 |
|------|------|------|
| Service Account JSON 体积大（~2.3 KB），SecretStorage 有大小限制 | 存储失败 | VS Code SecretStorage 上限为 ~100 KB per key，完全够用 |
| Vertex AI 的 `private_key` 包含换行符 `\n`，env 传递可能损坏 | 认证失败 | gemini-mcp server 已有 `fixWindowsSlashCorruption()`；我们用 `GOOGLE_CREDENTIALS_JSON` 传完整 JSON（非拆分 env） |
| 用户同时配置了 API Key 和 Vertex AI | 行为不确定 | 两者都注入，由 gemini-mcp server 端决定优先级（Vertex AI 优先） |
| Grok API key 格式未来可能变化 | 验证过严拒绝合法 key | 宽松验证：只检查 `xai-` 前缀，不限长度 |

---

## 7. 验收标准

### UI 重构
- [ ] 标题从 "Gemini AI Assistant" 变为 "AI Assistant"
- [ ] Gemini 和 Grok 两个 checkbox 子项并列
- [ ] 各自勾选/取消勾选时正确展开/折叠

### Grok 安全存储
- [ ] Settings UI 出现 Grok checkbox + password input
- [ ] API Key 存入 SecretStorage（非明文 settings.json）
- [ ] Enable + 有 Key → 启动 CLI 时 `XAI_API_KEY` 注入到 grok-assistant MCP server
- [ ] Disable → 不注入
- [ ] Key 为空 → 不注入
- [ ] UI 显示 masked key（`xai-••••...`）

### Gemini Vertex AI 导入
- [ ] Import 按钮点击后弹出系统文件选择器
- [ ] 选择非法 JSON → 显示错误提示
- [ ] 选择合法 Service Account JSON → 存入 SecretStorage，UI 显示 project ID
- [ ] Gemini enabled + 有 Vertex AI 凭据 → CLI 启动时注入 Vertex AI 环境变量
- [ ] Gemini API Key 现有行为不变（向后兼容）
- [ ] 两种凭据可共存，都注入

### Service Account JSON 验证规则
```json
{
  "type": "service_account",       // 必须
  "project_id": "xxx",             // 必须
  "private_key": "-----BEGIN...",  // 必须
  "client_email": "xxx@xxx.iam..." // 必须
}
```
