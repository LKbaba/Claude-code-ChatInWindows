# updatePRDv6-PLAN — Claude Opus 4.7 模型集成 + xhigh Thinking 档位 开发计划

> 基于：`specs/updatePRDv6.md` v4.1.0 | 创建日期：2026-04-16 | 状态：**已完成 ✅**

---

## 任务总览

| # | 任务 | 文件 | 依赖 | 优先级 | 状态 |
|---|------|------|------|--------|------|
| 1 | VALID_MODELS + MODEL_PRICING + displayNames | `constants.ts`, `ClaudeChatProvider.ts` | 无 | P0 | [x] |
| 2 | 模型选择器 UI + radio 映射 | `getBodyContent.ts`, `ui-script.ts` | 无 | P0 | [x] |
| 3 | 模型切换 switch + 统计表格解析 | `ClaudeChatProvider.ts`, `ui-script.ts` | 无 | P0 | [x] |
| 4 | xhigh Thinking 档位（前端 + 后端） | `getBodyContent.ts`, `ui-script.ts`, `ClaudeChatProvider.ts`, `package.json` | 无 | P0 | [x] |
| 5 | /ultrareview 斜杠命令 | `getBodyContent.ts` | 无 | P0 | [x] |
| 6 | _restoreComputeModeState bug 修复 + 过时注释 | `ClaudeChatProvider.ts`, `ui-script.ts` | 无 | P0 | [x] |
| 7 | 版本发布 + CHANGELOG + README | `package.json`, `getBodyContent.ts`, `CHANGELOG.md`, `README.md`, `README.zh-CN.md`, `README.zh-TW.md` | Task 1-6 | P0 | [x] |

**总任务数**：7 个
**预计总时间**：约 40 分钟

## 验收检查点

- [x] **Task 1-3 完成后**：模型选择功能验收 — 编译通过 ✅
- [x] **Task 4-6 完成后**：新功能+修复验收 — 编译通过 ✅
- [x] **Task 7 完成后**：版本发布验收 — 编译+打包成功，`claude-code-chatui-4.1.0.vsix` (323.5 KB) ✅

---

## Task 1：VALID_MODELS + MODEL_PRICING + displayNames

**预计时间**：5 分钟
**依赖**：无
**关联需求**：PRD 2.1.1, 2.1.2 改动 A+B
**状态**：[ ]

**上下文摘要**：
> `VALID_MODELS` 在 `src/utils/constants.ts:8-18`，是 `as const` 只读数组，用于模型验证。`MODEL_PRICING` 在 `ClaudeChatProvider.ts:63-80`，是 `Map<string, {input, output}>`，用于成本计算。`_formatModelName` 的 `modelDisplayNames` 在 `ClaudeChatProvider.ts:1441-1463`，用于统计面板和成本气泡的模型名格式化。三个位置需要同步添加 `claude-opus-4-7`。

**AI 提示词**：

你是一位资深 TypeScript 开发专家，精通 VS Code 扩展开发。ultrathink

请在模型注册系统中添加 Claude Opus 4.7。

## 背景

项目中模型 ID 在三个位置维护：
1. `src/utils/constants.ts` 第 8-18 行的 `VALID_MODELS` 数组（用于验证）
2. `src/providers/ClaudeChatProvider.ts` 第 63-80 行的 `MODEL_PRICING` Map（用于成本计算）
3. `src/providers/ClaudeChatProvider.ts` 第 1441-1463 行的 `modelDisplayNames` 对象（用于显示名称）

## 需求

### 1. `src/utils/constants.ts`（第 8-18 行）

在 `VALID_MODELS` 数组中，`'opusplan'` 之后、`'claude-opus-4-6'` 之前插入：

```typescript
'claude-opus-4-7',                // Opus 4.7 - Latest flagship with enhanced vision & self-verification
```

同时更新 `claude-opus-4-6` 的注释：
```typescript
'claude-opus-4-6',                // Opus 4.6 - Previous flagship with Adaptive Thinking
```

### 2. `src/providers/ClaudeChatProvider.ts` — MODEL_PRICING（第 64-65 行）

在 `claude-opus-4-6` 行之前插入：
```typescript
['claude-opus-4-7', { input: 5.00, output: 25.00 }],   // Opus 4.7 latest flagship with self-verification
```

同时更新 `claude-opus-4-6` 行注释：
```typescript
['claude-opus-4-6', { input: 5.00, output: 25.00 }],   // Opus 4.6 previous flagship with Adaptive Thinking
```

### 3. `src/providers/ClaudeChatProvider.ts` — modelDisplayNames（第 1441-1463 行）

在 `modelDisplayNames` 对象中，`'claude-opus-4-6': 'Opus 4.6'` 行之前插入：
```typescript
'claude-opus-4-7': 'Opus 4.7',
```

## 约束条件

- 定价不变：$5.00 input / $25.00 output（与 Opus 4.6 相同）
- 代码注释用英文
- 不要修改任何已有模型的定价数据

**验收标准**：
- [ ] `npm run compile` 编译零错误
- [ ] `VALID_MODELS` 包含 `'claude-opus-4-7'`
- [ ] `MODEL_PRICING.get('claude-opus-4-7')` 返回 `{ input: 5.00, output: 25.00 }`
- [ ] `modelDisplayNames['claude-opus-4-7']` 返回 `'Opus 4.7'`

---

## Task 2：模型选择器 UI + radio 映射

**预计时间**：8 分钟
**依赖**：无
**关联需求**：PRD 2.1.3, 2.1.4 改动 A+B+C
**状态**：[ ]

**上下文摘要**：
> 模型选择器 Modal 在 `getBodyContent.ts:569-663`，每个模型是一个 `<div class="tool-item">` 包含 radio button。前端 `selectModel()` 函数在 `ui-script.ts:2596-2644`，包含两个重复的 `displayNames` map（第 2600-2610 行和第 2648-2658 行），以及一个 radio ID 映射（第 2626-2637 行的 if-else 链）。

**AI 提示词**：

你是一位资深 TypeScript 开发专家，精通 VS Code Webview UI 开发。ultrathink

请在模型选择器 UI 中添加 Opus 4.7 选项，并更新前端的 displayNames 和 radio 映射。

## 背景

模型选择器是一个弹窗 Modal，定义在 `src/ui-v2/getBodyContent.ts` 第 569-663 行。当前排列顺序为：Opus → Opus 4.5 → Opus 4.6 → Opus Plan → Sonnet → Sonnet 4.6 → Sonnet 4.5 → Haiku 4.5 → Default。

前端 JS 中有两个重要位置：
- `selectModel()` 函数中的 `displayNames` map（`ui-script.ts` 第 2600-2610 行），用于更新按钮文字
- 初始化块中的 `displayNames` map（`ui-script.ts` 第 2648-2658 行），是前一个的重复
- `selectModel()` 函数中的 radio ID 映射（第 2626-2637 行），因为 DOM id 用短名（如 `model-opus-4-6`）而非完整 model ID

**⚠️ 注意 `ui-script.ts` 的特殊性**：整个文件是 TypeScript 模板字面量中的 JavaScript 代码。但本次修改内容不含需要特殊转义的字符。

## 需求

### 1. `src/ui-v2/getBodyContent.ts` — 模型选择器 Modal

在 **Opus 4.6**（第 598-606 行）**之前**插入一个新的 `<div class="tool-item">`：

```html
				<div class="tool-item" onclick="selectModel('claude-opus-4-7')">
					<input type="radio" name="model" id="model-opus-4-7" value="claude-opus-4-7">
					<label for="model-opus-4-7">
						<div class="model-title">Opus 4.7 - Latest flagship model</div>
						<div class="model-description">
							Enhanced vision, self-verification & 1M context
						</div>
					</label>
				</div>
```

同时把现有 Opus 4.6 的标题从 `Opus 4.6 - Latest flagship model` 改为 `Opus 4.6 - Previous flagship model`。

### 2. `src/ui-v2/ui-script.ts` — selectModel() displayNames 第 1 处（第 2600-2610 行）

在 `'opus': 'Opus',` 行之后添加：
```javascript
'claude-opus-4-7': 'Opus 4.7',
```

### 3. `src/ui-v2/ui-script.ts` — displayNames 第 2 处（第 2648-2658 行）

同样在 `'opus': 'Opus',` 行之后添加：
```javascript
'claude-opus-4-7': 'Opus 4.7',
```

### 4. `src/ui-v2/ui-script.ts` — radio ID 映射（第 2626-2637 行）

当前第一个 if 是 `if (model === 'claude-opus-4-6')`。在它**之前**插入：
```javascript
if (model === 'claude-opus-4-7') {
    radioId = 'model-opus-4-7';
} else
```

使得原来的 `if (model === 'claude-opus-4-6')` 变成 `else if`。

## 约束条件

- 保持缩进与现有代码一致（tab 缩进）
- 不要修改现有模型选项的 HTML 结构
- `displayNames` 两处 map 必须保持一致
- 代码注释用英文

**验收标准**：
- [ ] 编译零错误
- [ ] 模型选择器中 Opus 4.7 显示在 Opus 4.6 之前
- [ ] Opus 4.7 标注 "Latest flagship model"，Opus 4.6 标注 "Previous flagship model"
- [ ] 选择 Opus 4.7 后按钮文字显示 "Opus 4.7"
- [ ] 再次打开 Modal，Opus 4.7 的 radio 按钮处于选中状态

---

## Task 3：模型切换 switch + 统计表格解析

**预计时间**：8 分钟
**依赖**：无
**关联需求**：PRD 2.1.2 改动 C, PRD 2.1.4 改动 D+E
**状态**：[ ]

**上下文摘要**：
> 后端模型切换在 `ClaudeChatProvider.ts:3127-3176` 的 `_setSelectedModel()` 方法中，一个 switch-case 为每个模型生成确认消息。统计表格的模型名称解析在 `ui-script.ts` 中有两处完全重复的逻辑（第 4034-4041 行和第 4090-4097 行），通过解析模型 ID 字符串（如 `claude-opus-4-6`）的 `-` 分割来生成显示名称。

**AI 提示词**：

你是一位资深 TypeScript 开发专家，精通 VS Code 扩展开发。ultrathink

请在模型切换确认和统计表格中添加 Opus 4.7 支持。

## 背景

### 1. 模型切换确认（后端）

`src/providers/ClaudeChatProvider.ts` 第 3127-3176 行的 `_setSelectedModel()` 方法包含一个 switch-case，为每个模型生成不同的确认消息。当前 `claude-opus-4-6` 的消息为：

```typescript
case 'claude-opus-4-6':
    displayName = 'Opus 4.6';
    message = `Claude model switched to: ${displayName} (Latest flagship with Adaptive Thinking & 1M context)`;
    break;
```

### 2. 统计表格模型名称解析（前端）

`src/ui-v2/ui-script.ts` 中有两段**完全相同**的模型名称解析逻辑：
- 第 4024-4054 行（daily/monthly 视图）
- 第 4080-4110 行（session 视图）

它们通过 `-` 分割模型 ID 字符串然后组装显示名称。当前 Opus 系列的处理逻辑：

```javascript
} else if (modelParts[1] === 'opus' && modelParts[2] === '4') {
    if (modelParts[3] === '6') {
        return 'Opus 4.6';
    } else if (modelParts[3] === '1') {
        return 'Opus 4.1';
    }
    return 'Opus 4';
}
```

## 需求

### 1. `src/providers/ClaudeChatProvider.ts` — _setSelectedModel switch（第 3140 行起）

在 `case 'claude-opus-4-6':` **之前**插入新 case：

```typescript
			case 'claude-opus-4-7':
				displayName = 'Opus 4.7';
				message = `Claude model switched to: ${displayName} (Latest flagship with enhanced vision, self-verification & 1M context)`;
				break;
```

同时将现有 `claude-opus-4-6` case 的消息从 `(Latest flagship...` 改为 `(Previous flagship with Adaptive Thinking & 1M context)`。

### 2. `src/ui-v2/ui-script.ts` — 统计表格解析第 1 处（第 4034-4041 行）

在 `if (modelParts[3] === '6')` 之前添加：
```javascript
if (modelParts[3] === '7') {
    return 'Opus 4.7'; // claude-opus-4-7 -> Opus 4.7
} else
```

使原来的 `if (modelParts[3] === '6')` 变成 `else if`。

### 3. `src/ui-v2/ui-script.ts` — 统计表格解析第 2 处（第 4090-4097 行）

**完全相同的修改**。在 `if (modelParts[3] === '6')` 之前添加同样的 `'7'` 分支。

## 约束条件

- 两处统计解析逻辑的修改必须完全一致
- 不要尝试合并或重构这两段重复代码（属于技术债，不在本次范围）
- 代码注释用英文

**验收标准**：
- [ ] 编译零错误
- [ ] 选择 Opus 4.7 后 VS Code 弹出确认消息包含 "Opus 4.7" 和 "Latest flagship"
- [ ] 统计面板中 `claude-opus-4-7` 使用记录显示为 "Opus 4.7"

---

## Task 4：xhigh Thinking 档位（前端 + 后端）

**预计时间**：10 分钟
**依赖**：无
**关联需求**：PRD 2.3
**状态**：[ ]

**上下文摘要**：
> Thinking Intensity 通过 5 档滑块控制（Think / Think Hard / Think Harder / Ultrathink / Sequential），滑块在 `getBodyContent.ts:714-739`，JS 逻辑在 `ui-script.ts`。后端通过 prompt 前缀注入实现（`ClaudeChatProvider.ts:536-561`），不走 CLI `--effort` 参数。`thinkingMessage` 是固定的 `' THROUGH THIS STEP BY STEP: \n\n'`，拼接在 `thinkingPrompt` 后面。`package.json:168-174` 定义了 `thinking.intensity` 的 enum 值。还有一处 settingsData 恢复逻辑在 `ui-script.ts:3253`。

**AI 提示词**：

你是一位资深 TypeScript 开发专家，精通 VS Code 扩展的 Webview UI 和后端消息处理。ultrathink

请在 Thinking Intensity 系统中添加 xHigh 档位（在 Ultrathink 和 Sequential 之间）。

## 背景

当前 Thinking Intensity 有 5 档，通过滑块控制：
- 位置 0: Think → prompt 前缀 `THINK`
- 位置 1: Think Hard → `THINK HARD`
- 位置 2: Think Harder → `THINK HARDER`
- 位置 3: Ultrathink → `ULTRATHINK`
- 位置 4: Sequential (MCP) → 使用 MCP 工具

后端拼接逻辑（`ClaudeChatProvider.ts:540-561`）：
```typescript
const thinkingMessage = ' THROUGH THIS STEP BY STEP: \n\n';
// ...
actualMessage = thinkingPrompt + thinkingMessage + actualMessage;
```

所以 `thinkingPrompt` 后面总是会拼接 ` THROUGH THIS STEP BY STEP: \n\n`。

## 需求

### 1. `src/ui-v2/getBodyContent.ts` — 滑块 HTML（第 714-739 行）

**a.** 将滑块 `max="4"` 改为 `max="5"`：
```html
<input type="range" min="0" max="5" value="0" step="1" class="thinking-slider" id="thinkingIntensitySlider" oninput="updateThinkingIntensityDisplay(this.value)">
```

**b.** 在 Ultrathink（label-3）和 Sequential（当前是 label-4，改后变 label-5）之间插入新 label：
```html
<div class="slider-label" id="thinking-label-4" onclick="setThinkingIntensityValue(4)">xHigh</div>
```

**c.** 把原来的 Sequential label 的 id 从 `thinking-label-4` 改为 `thinking-label-5`，onclick 参数也从 `4` 改为 `5`：
```html
<div class="slider-label" id="thinking-label-5" onclick="setThinkingIntensityValue(5)">Sequential (MCP)</div>
```

### 2. `src/ui-v2/ui-script.ts` — intensityValues 数组（第 2342 行）

```javascript
// Before: const intensityValues = ['think', 'think-hard', 'think-harder', 'ultrathink', 'sequential-thinking'];
// After:
const intensityValues = ['think', 'think-hard', 'think-harder', 'ultrathink', 'xhigh', 'sequential-thinking'];
```

### 3. `src/ui-v2/ui-script.ts` — intensityNames 数组（第 2356 行）

```javascript
// Before: const intensityNames = ['Think', 'Think Hard', 'Think Harder', 'Ultrathink', 'Sequential (MCP)'];
// After:
const intensityNames = ['Think', 'Think Hard', 'Think Harder', 'Ultrathink', 'xHigh', 'Sequential (MCP)'];
```

### 4. `src/ui-v2/ui-script.ts` — updateThinkingIntensityDisplay 循环上限（第 2366 行）

```javascript
// Before: for (let i = 0; i < 5; i++) {
// After:
for (let i = 0; i < 6; i++) {
```

### 5. `src/ui-v2/ui-script.ts` — settingsData 恢复逻辑中的 intensityValues（第 3253 行）

```javascript
// Before: const intensityValues = ['think', 'think-hard', 'think-harder', 'ultrathink', 'sequential-thinking'];
// After:
const intensityValues = ['think', 'think-hard', 'think-harder', 'ultrathink', 'xhigh', 'sequential-thinking'];
```

### 6. `src/providers/ClaudeChatProvider.ts` — thinkingMode switch（第 541-560 行）

在 `case 'ultrathink':` 之后、`case 'sequential-thinking':` 之前插入：

```typescript
				case 'xhigh':
					thinkingPrompt = 'THINK AT THE HIGHEST LEVEL OF DEPTH AND RIGOR';
					break;
```

> ⚠️ 关键：`thinkingPrompt` 后面会自动拼接 `' THROUGH THIS STEP BY STEP: \n\n'`。所以 prompt 中不要包含 "THROUGH THIS" 避免重复。最终发出的前缀为：
> `THINK AT THE HIGHEST LEVEL OF DEPTH AND RIGOR THROUGH THIS STEP BY STEP:`

### 7. `package.json` — thinking.intensity enum（第 168-174 行）

在 `"ultrathink"` 和 `"sequential-thinking"` 之间添加 `"xhigh"`：

```json
"enum": [
    "think",
    "think-hard",
    "think-harder",
    "ultrathink",
    "xhigh",
    "sequential-thinking"
],
```

## 约束条件

- `intensityValues` 数组在 `ui-script.ts` 中出现两次（第 2342 行和第 3253 行），两处必须保持一致
- 滑块 label 的 id 和 onclick 参数必须与数组索引对应
- 不要修改已有的 4 个 intensity 的 prompt 前缀
- 代码注释用英文

**验收标准**：
- [ ] 编译零错误
- [ ] 滑块显示 6 个档位：Think / Think Hard / Think Harder / Ultrathink / xHigh / Sequential (MCP)
- [ ] 选择 xHigh 后，Thinking Mode 标签变为 "xHigh Mode"
- [ ] 开启 Thinking Mode 选择 xHigh 发送消息，消息前缀包含 `THINK AT THE HIGHEST LEVEL OF DEPTH AND RIGOR THROUGH THIS STEP BY STEP:`
- [ ] 关闭并重新打开面板，xHigh 设置能正确恢复
- [ ] package.json 的 enum 包含 6 个值

---

## Task 5：/ultrareview 斜杠命令

**预计时间**：2 分钟
**依赖**：无
**关联需求**：PRD 2.2
**状态**：[ ]

**上下文摘要**：
> 斜杠命令在 `getBodyContent.ts:823-915` 中是静态 HTML 列表。点击后调用 `executeSlashCommand(name)` 函数（`ui-script.ts:2427-2441`），该函数发送 `{ type: 'executeSlashCommand', command }` 到后端。后端 `_executeSlashCommand()` 在终端中运行 `claude /<command>`，纯透传无需额外处理。

**AI 提示词**：

你是一位资深 TypeScript 开发专家，精通 VS Code Webview UI 开发。

请在斜杠命令列表中添加 `/ultrareview` 命令。

## 背景

斜杠命令在 `src/ui-v2/getBodyContent.ts` 第 823-915 行中以静态 HTML 定义。`/review`（第 838-843 行）已存在。`executeSlashCommand()` 是纯透传机制，无需后端改动。

## 需求

在 `/review` 命令项（第 843 行 `</div>` 结束标签）**之后**，插入：

```html
				<div class="slash-command-item" onclick="executeSlashCommand('ultrareview')">
					<div class="slash-command-icon">🔬</div>
					<div class="slash-command-content">
						<div class="slash-command-title">/ultrareview</div>
						<div class="slash-command-description">Deep code review with bug detection & design analysis (Opus 4.7+)</div>
					</div>
				</div>
```

## 约束条件

- 保持缩进与现有命令一致（tab 缩进）
- 不要修改任何已有命令
- 代码注释用英文

**验收标准**：
- [ ] 编译零错误
- [ ] 点击 `/` 按钮后弹窗中出现 `/ultrareview` 命令
- [ ] 点击 `/ultrareview` 后打开终端执行 `claude /ultrareview`

---

## Task 6：_restoreComputeModeState bug 修复 + 过时注释

**预计时间**：3 分钟
**依赖**：无
**关联需求**：PRD 2.1.2 改动 D, PRD 4（遗留问题）
**状态**：[ ]

**上下文摘要**：
> `_restoreComputeModeState()` 在 `ClaudeChatProvider.ts:3242-3269` 中，VS Code 启动时恢复 Max 模式和 Enhance Subagents 的环境变量。当前用的是 `SONNET_4_5 = 'claude-sonnet-4-5-20250929'`（第 3248 行），但运行时的 `_handleModeSelection()` 和 `_handleSubagentEnhancement()` 已更新为 `SONNET_4_6 = 'claude-sonnet-4-6'`。此外 `ui-script.ts:6167` 有一条过时注释写着 "uses Sonnet 4.5"。

**AI 提示词**：

你是一位资深 TypeScript 开发专家，精通 VS Code 扩展调试。

请修复 `_restoreComputeModeState` 方法中的模型版本不一致 bug，以及一处过时注释。

## 背景

### Bug 描述

`src/providers/ClaudeChatProvider.ts` 中有三个方法管理 Compute Mode 环境变量：
- `_handleModeSelection()` 第 3182-3207 行 — 运行时切换，使用 `const SONNET_4_6 = 'claude-sonnet-4-6'`
- `_handleSubagentEnhancement()` 第 3213-3237 行 — 运行时切换，使用 `const SONNET_4_6 = 'claude-sonnet-4-6'`
- `_restoreComputeModeState()` 第 3242-3269 行 — **启动恢复，使用 `const SONNET_4_5 = 'claude-sonnet-4-5-20250929'`** ← bug

这导致：用户启用 Max 模式 → 关闭 VS Code → 重新打开 → `ANTHROPIC_DEFAULT_HAIKU_MODEL` 被恢复为 `claude-sonnet-4-5-20250929` 而非 `claude-sonnet-4-6`。

Debug log 也验证了：启动时日志显示 `Restored Max mode` 但不会像运行时那样显示 "Using Sonnet 4.6"。

### 过时注释

`src/ui-v2/ui-script.ts` 第 6167 行：
```javascript
// If Max mode, notify backend to restore environment variable settings (uses Sonnet 4.5)
```

## 需求

### 1. `src/providers/ClaudeChatProvider.ts`（第 3242-3269 行）

**a.** 将第 3248 行 `const SONNET_4_5 = 'claude-sonnet-4-5-20250929';` 改为：
```typescript
const SONNET_4_6 = 'claude-sonnet-4-6';
```

**b.** 将第 3252 行 `process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = SONNET_4_5;` 改为：
```typescript
process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = SONNET_4_6;
```

**c.** 将第 3258 行 `process.env.CLAUDE_CODE_SUBAGENT_MODEL = SONNET_4_5;` 改为：
```typescript
process.env.CLAUDE_CODE_SUBAGENT_MODEL = SONNET_4_6;
```

**d.** 将第 3267 行向下兼容路径中的 `const SONNET_4_5 = 'claude-sonnet-4-5-20250929';` 和 `SONNET_4_5` 引用也统一改为 `SONNET_4_6` / `'claude-sonnet-4-6'`。

### 2. `src/ui-v2/ui-script.ts`（第 6167 行）

将注释从：
```javascript
// If Max mode, notify backend to restore environment variable settings (uses Sonnet 4.5)
```
改为：
```javascript
// If Max mode, notify backend to restore environment variable settings (uses Sonnet 4.6)
```

## 约束条件

- 不要修改 `_handleModeSelection()` 或 `_handleSubagentEnhancement()` 的代码
- 只改变量值和注释，不改函数逻辑
- 代码注释用英文

**验收标准**：
- [ ] 编译零错误
- [ ] 启动时 debug_log 显示 `Restored Max mode` 后，`ANTHROPIC_DEFAULT_HAIKU_MODEL` 值为 `claude-sonnet-4-6`
- [ ] `ui-script.ts:6167` 注释中为 "Sonnet 4.6"

---

## Task 7：版本发布 + CHANGELOG + README

**预计时间**：10 分钟
**依赖**：Task 1-6
**关联需求**：PRD 2.5
**状态**：[ ]

**上下文摘要**：
> 版本发布需要更新 5 个位置（参见 CLAUDE.md "Version Release Checklist"）：`package.json` 版本号、`getBodyContent.ts` 版本显示字符串（第 9 行）、`CHANGELOG.md`、`README.md`（3 个语言版本）。当前版本为 v4.0.10。

**AI 提示词**：

你是一位资深的技术文档专家，精通 VS Code 扩展发布流程。

请执行 v4.1.0 版本发布的文件更新。

## 背景

当前版本为 `v4.0.10`（2026-04-13）。本次升级至 `v4.1.0` 包含：
- Claude Opus 4.7 模型支持
- xHigh Thinking Intensity 档位
- /ultrareview 斜杠命令
- _restoreComputeModeState bug 修复

需要更新的文件参见 CLAUDE.md 中的 "Version Release Checklist"。

## 需求

### 1. `package.json`

将 `"version": "4.0.10"` 改为 `"version": "4.1.0"`

### 2. `src/ui-v2/getBodyContent.ts`（第 9 行）

将 `v4.0.10` 改为 `v4.1.0`

### 3. `CHANGELOG.md`

在文件顶部（现有第一个版本条目之前）添加新版本 section：

```markdown
## v4.1.0 (2026-04-16)

### New Features
- **Claude Opus 4.7 Model Support**
  - Added `claude-opus-4-7` to valid model list and pricing config ($5.00/$25.00 per M tokens)
  - Model selector UI now includes Opus 4.7 option (Latest flagship model)
  - Statistics formatting logic supports Opus 4.7 version detection
  - Opus 4.6 descriptions updated to "Previous flagship"
- **xHigh Thinking Intensity**
  - New slider position between Ultrathink and Sequential (MCP)
  - Prompt prefix: "THINK AT THE HIGHEST LEVEL OF DEPTH AND RIGOR"
  - Corresponds to Opus 4.7's recommended `xhigh` effort level for coding
- **/ultrareview Slash Command**
  - Deep code review with bug detection & design analysis
  - Passthrough to Claude CLI `claude /ultrareview`

### Bug Fixes
- **Fixed _restoreComputeModeState using Sonnet 4.5 instead of Sonnet 4.6**
  - Max mode and Enhance Subagents now correctly restore `claude-sonnet-4-6` on VS Code restart
  - Previously restored to `claude-sonnet-4-5-20250929`, inconsistent with runtime behavior
- Fixed stale comment referencing "Sonnet 4.5" in ui-script.ts

### Files Modified
| File | Changes |
|------|---------|
| `src/utils/constants.ts` | Added `claude-opus-4-7` to VALID_MODELS |
| `src/providers/ClaudeChatProvider.ts` | Pricing, displayName, switch case, xhigh thinking, restoreComputeMode fix |
| `src/ui-v2/getBodyContent.ts` | Model selector, /ultrareview, thinking slider max=5 |
| `src/ui-v2/ui-script.ts` | displayNames, radioId, stats parsing, intensityValues/Names, loop bound, comment fix |
| `package.json` | Version bump, thinking.intensity enum |
```

### 4. `README.md`

在 Recent Updates 表格顶部添加：
```markdown
| **v4.1.0** | 2026-04-16 | Claude Opus 4.7 model support, xHigh thinking intensity, /ultrareview command |
```

### 5. `README.zh-CN.md`

在 Recent Updates 表格顶部添加：
```markdown
| **v4.1.0** | 2026-04-16 | Claude Opus 4.7 模型支持，xHigh 思考强度，/ultrareview 命令 |
```

### 6. `README.zh-TW.md`

在 Recent Updates 表格顶部添加：
```markdown
| **v4.1.0** | 2026-04-16 | Claude Opus 4.7 模型支援，xHigh 思考強度，/ultrareview 命令 |
```

## 约束条件

- 严格按照 CLAUDE.md 的 "Version Release Checklist" 执行
- CHANGELOG 条目用英文
- README 表格行保持与现有行格式一致
- 代码注释用英文

**验收标准**：
- [ ] `package.json` 版本为 `"4.1.0"`
- [ ] 前端版本显示为 `v4.1.0`
- [ ] CHANGELOG 顶部为 v4.1.0 section
- [ ] 三个 README 文件各新增一行
- [ ] `npm run compile` 编译通过
- [ ] `cmd //c "npx @vscode/vsce package --no-dependencies"` 打包成功，输出文件为 `claude-code-chatui-4.1.0.vsix`
