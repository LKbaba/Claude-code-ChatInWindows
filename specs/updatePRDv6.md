# updatePRDv6 — Claude Opus 4.7 模型集成 + xhigh Thinking 档位

> 版本：v4.1.0 | 创建日期：2026-04-16 | 状态：**已确认** ✅

## 1. 背景与动机

### 1.1 触发事件

Anthropic 于 2026-04-16 发布 Claude Opus 4.7（模型 ID：`claude-opus-4-7`）。主要升级：

- **编码能力**：CursorBench 70% vs 58%（4.6）；Rakuten-SWE 3x 提升
- **视觉能力**：分辨率提升 3 倍（约 375 万像素），视觉准确率 98.5% vs 54.5%
- **自我验证**：输出前自查错误
- **指令遵循**：极度精准、字面执行
- **定价不变**：$5/M 输入 + $25/M 输出
- **新增 effort 档位**：`xhigh`（介于 `high` 和 `max` 之间，Opus 4.7 编码推荐档位）
- **新增命令**：`/ultrareview` — 深度代码审查
- **新增功能**：Task Budgets (beta)

### 1.2 Grok 交叉验证结论（4 次独立搜索）

| 搜索源 | 结论 |
|--------|------|
| Anthropic 官网 | 模型 ID `claude-opus-4-7`，定价 $5/$25 不变 |
| X 社区讨论 | CLI 已支持 `--model claude-opus-4-7`，`/model opus` alias |
| 技术文档 | `/effort xhigh` 是 CC 新 sticky 命令，推荐 Opus 4.7 编码默认档位 |
| xhigh 专项 | 社区验证 "ULTRATHINK" prompt 触发词等效于 xhigh/max 级别深度推理 |

### 1.3 不在范围内

- Opus 4.7 的 1M 上下文扩展模式（`[1m]` 后缀）— 当前插件已有 `CLAUDE_CODE_DISABLE_1M_CONTEXT` 配置
- Task Budgets API 集成 — beta 阶段，等稳定后再考虑
- `CLAUDE_CODE_MAKE_NO_MISTAKES` 等未验证的环境变量

---

## 2. 需求列表

### 2.1 P0 — 模型列表新增 Opus 4.7

需要修改 **4 个源文件**，共 **13 处改动**：

---

#### 2.1.1 `src/utils/constants.ts` — VALID_MODELS 数组（第 8-18 行）

**改动**：新增 `claude-opus-4-7`，更新 Opus 4.6 注释。

```typescript
export const VALID_MODELS = [
    'opus',
    'sonnet',
    'default',
    'opusplan',
    'claude-opus-4-7',                // Opus 4.7 - Latest flagship with enhanced vision & self-verification
    'claude-opus-4-6',                // Opus 4.6 - Previous flagship with Adaptive Thinking
    'claude-opus-4-5-20251101',       // Opus 4.5
    'claude-sonnet-4-6',              // Sonnet 4.6 - Latest intelligent model
    'claude-sonnet-4-5-20250929',     // Sonnet 4.5
    'claude-haiku-4-5-20251001'       // Haiku 4.5
] as const;
```

---

#### 2.1.2 `src/providers/ClaudeChatProvider.ts` — 4 处改动

**改动 A：MODEL_PRICING Map**（第 64-65 行）

新增 Opus 4.7 定价行，更新 Opus 4.6 注释：
```typescript
['claude-opus-4-7', { input: 5.00, output: 25.00 }],   // Opus 4.7 latest flagship with self-verification
['claude-opus-4-6', { input: 5.00, output: 25.00 }],   // Opus 4.6 previous flagship with Adaptive Thinking
```

**改动 B：_formatModelName displayNames**（第 1441-1463 行）

新增一行：
```typescript
'claude-opus-4-7': 'Opus 4.7',
'claude-opus-4-6': 'Opus 4.6',
```

**改动 C：_setSelectedModel switch**（第 3140 行起）

在 `claude-opus-4-6` case 之前新增，并降级 4.6 描述：
```typescript
case 'claude-opus-4-7':
    displayName = 'Opus 4.7';
    message = `Claude model switched to: ${displayName} (Latest flagship with enhanced vision, self-verification & 1M context)`;
    break;
case 'claude-opus-4-6':
    displayName = 'Opus 4.6';
    message = `Claude model switched to: ${displayName} (Previous flagship with Adaptive Thinking & 1M context)`;
    break;
```

**改动 D：_restoreComputeModeState 遗留 bug 修复**（第 3248-3268 行）

> ⚠️ 发现 bug：`_restoreComputeModeState()` 使用 `SONNET_4_5` 恢复环境变量，但 `_handleModeSelection()` 和 `_handleSubagentEnhancement()` 使用的是 `SONNET_4_6`。重启 VS Code 后 Max 模式和 Enhance Subagents 会回退到 Sonnet 4.5，与运行时行为不一致。

修复：将第 3248、3252、3258、3267 行的 `SONNET_4_5` / `claude-sonnet-4-5-20250929` 统一改为 `SONNET_4_6` / `claude-sonnet-4-6`。

---

#### 2.1.3 `src/ui-v2/getBodyContent.ts` — 模型选择器 Modal（第 598-606 行）

在 Opus 4.6 之前插入 Opus 4.7，并降级 Opus 4.6 标题：

```html
<div class="tool-item" onclick="selectModel('claude-opus-4-7')">
    <input type="radio" name="model" id="model-opus-4-7" value="claude-opus-4-7">
    <label for="model-opus-4-7">
        <div class="model-title">Opus 4.7 - Latest flagship model</div>
        <div class="model-description">Enhanced vision, self-verification & 1M context</div>
    </label>
</div>
<div class="tool-item" onclick="selectModel('claude-opus-4-6')">
    <input type="radio" name="model" id="model-opus-4-6" value="claude-opus-4-6">
    <label for="model-opus-4-6">
        <div class="model-title">Opus 4.6 - Previous flagship model</div>
        <div class="model-description">Adaptive Thinking & 1M context window</div>
    </label>
</div>
```

---

#### 2.1.4 `src/ui-v2/ui-script.ts` — 6 处改动

**改动 A：selectModel() displayNames 第 1 处**（第 2600-2610 行）

```javascript
'claude-opus-4-7': 'Opus 4.7',    // NEW
'claude-opus-4-6': 'Opus 4.6',
```

**改动 B：selectModel() displayNames 第 2 处**（第 2648-2658 行）

同上，重复 map，两处保持一致。

**改动 C：selectModel() radio ID 映射**（第 2626-2637 行）

```javascript
if (model === 'claude-opus-4-7') {
    radioId = 'model-opus-4-7';
} else if (model === 'claude-opus-4-6') {
    radioId = 'model-opus-4-6';
}
```

**改动 D + E：统计表格模型名称解析（2 处重复逻辑）**（第 4034-4041 行 + 第 4090-4097 行）

两处均新增 `modelParts[3] === '7'` 分支：
```javascript
} else if (modelParts[1] === 'opus' && modelParts[2] === '4') {
    if (modelParts[3] === '7') {
        return 'Opus 4.7'; // claude-opus-4-7 -> Opus 4.7
    } else if (modelParts[3] === '6') {
        return 'Opus 4.6';
    } else if (modelParts[3] === '1') {
        return 'Opus 4.1';
    }
    return 'Opus 4';
}
```

**改动 F：过时注释修复**（第 6167 行）

```javascript
// 当前：// If Max mode, notify backend to restore environment variable settings (uses Sonnet 4.5)
// 改为：// If Max mode, notify backend to restore environment variable settings (uses Sonnet 4.6)
```

---

### 2.2 P0 — 新增 /ultrareview 斜杠命令

**涉及文件**：`src/ui-v2/getBodyContent.ts`

在 `/review`（第 843 行）之后插入：

```html
<div class="slash-command-item" onclick="executeSlashCommand('ultrareview')">
    <div class="slash-command-icon">🔬</div>
    <div class="slash-command-content">
        <div class="slash-command-title">/ultrareview</div>
        <div class="slash-command-description">Deep code review with bug detection & design analysis (Opus 4.7+)</div>
    </div>
</div>
```

> 无需后端修改 — `executeSlashCommand()` 直接在终端执行 `claude /ultrareview`，透传机制。

---

### 2.3 P0 — Thinking Intensity 新增 xhigh 档位

#### 2.3.1 设计决策

Grok 验证结论：
- `xhigh` 是 Opus 4.7 编码推荐的官方 effort 档位
- 社区验证 "ULTRATHINK" prompt 前缀可触发等效效果
- 我们的滑块通过 **prompt 前缀注入**实现（非 CLI `--effort` 参数），所以可以用 prompt 触发词覆盖

**方案：在 Ultrathink 和 Sequential 之间新增 "xHigh" 档位**

新增的 prompt 前缀为：`THINK THROUGH THIS AT THE HIGHEST LEVEL OF DEPTH AND RIGOR STEP BY STEP:`
（这个前缀与 Ultrathink 级别不同，明确要求"最高深度和严谨度"，语义上对应 xhigh 的定位）

#### 2.3.2 涉及修改（6 个位置）

**① `src/ui-v2/getBodyContent.ts` — 滑块 HTML**（第 714-739 行）

- 滑块 `max="4"` → `max="5"`
- 新增第 6 个 label（在 Ultrathink 和 Sequential 之间）：

```html
<input type="range" min="0" max="5" value="0" step="1" ...>
<div class="slider-labels">
    <div class="slider-label active" id="thinking-label-0" onclick="setThinkingIntensityValue(0)">Think</div>
    <div class="slider-label" id="thinking-label-1" onclick="setThinkingIntensityValue(1)">Think Hard</div>
    <div class="slider-label" id="thinking-label-2" onclick="setThinkingIntensityValue(2)">Think Harder</div>
    <div class="slider-label" id="thinking-label-3" onclick="setThinkingIntensityValue(3)">Ultrathink</div>
    <div class="slider-label" id="thinking-label-4" onclick="setThinkingIntensityValue(4)">xHigh</div>
    <div class="slider-label" id="thinking-label-5" onclick="setThinkingIntensityValue(5)">Sequential (MCP)</div>
</div>
```

**② `src/ui-v2/ui-script.ts` — intensityValues 数组**（第 2342 行）

```javascript
// 当前：const intensityValues = ['think', 'think-hard', 'think-harder', 'ultrathink', 'sequential-thinking'];
// 改为：
const intensityValues = ['think', 'think-hard', 'think-harder', 'ultrathink', 'xhigh', 'sequential-thinking'];
```

**③ `src/ui-v2/ui-script.ts` — intensityNames 数组**（第 2356 行）

```javascript
// 当前：const intensityNames = ['Think', 'Think Hard', 'Think Harder', 'Ultrathink', 'Sequential (MCP)'];
// 改为：
const intensityNames = ['Think', 'Think Hard', 'Think Harder', 'Ultrathink', 'xHigh', 'Sequential (MCP)'];
```

**④ `src/ui-v2/ui-script.ts` — updateThinkingIntensityDisplay 循环上限**（第 2366 行）

```javascript
// 当前：for (let i = 0; i < 5; i++) {
// 改为：
for (let i = 0; i < 6; i++) {
```

**⑤ `src/ui-v2/ui-script.ts` — settingsData 恢复逻辑**（第 3253 行）

```javascript
// 当前：const intensityValues = ['think', 'think-hard', 'think-harder', 'ultrathink', 'sequential-thinking'];
// 改为：
const intensityValues = ['think', 'think-hard', 'think-harder', 'ultrathink', 'xhigh', 'sequential-thinking'];
```

**⑥ `src/providers/ClaudeChatProvider.ts` — thinkingMode switch**（第 541-560 行）

在 `ultrathink` case 之后新增：
```typescript
case 'xhigh':
    thinkingPrompt = 'THINK THROUGH THIS AT THE HIGHEST LEVEL OF DEPTH AND RIGOR';
    break;
```

> 注意：`thinkingMessage` 变量（` THROUGH THIS STEP BY STEP: \n\n`）会拼接在后面，所以这里不需要重复 "STEP BY STEP"。
> 实际发出的完整前缀为：`THINK THROUGH THIS AT THE HIGHEST LEVEL OF DEPTH AND RIGOR THROUGH THIS STEP BY STEP:`
> 
> **等等——这有拼接问题。** 重新审视拼接逻辑：
> ```typescript
> actualMessage = thinkingPrompt + thinkingMessage + actualMessage;
> // thinkingMessage = ' THROUGH THIS STEP BY STEP: \n\n'
> ```
> 
> 如果 `thinkingPrompt = 'THINK THROUGH THIS AT THE HIGHEST LEVEL OF DEPTH AND RIGOR'`，拼接后变成：
> `THINK THROUGH THIS AT THE HIGHEST LEVEL OF DEPTH AND RIGOR THROUGH THIS STEP BY STEP:`
> — "THROUGH" 重复了，语义奇怪。
>
> **修正**：prompt 应该不含 "THROUGH THIS"，让 `thinkingMessage` 自然拼接：

```typescript
case 'xhigh':
    thinkingPrompt = 'THINK AT THE HIGHEST LEVEL OF DEPTH AND RIGOR';
    break;
```

> 拼接结果：`THINK AT THE HIGHEST LEVEL OF DEPTH AND RIGOR THROUGH THIS STEP BY STEP:`
> ✅ 语义通顺

**⑦ `package.json` — thinking.intensity enum**（第 168-174 行）

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

**⑧ `src/managers/config/VsCodeConfigManager.ts`**

`getThinkingIntensity()` 方法（第 324-327 行）无需修改——它返回字符串，不做 enum 校验，新值自动兼容。

---

### 2.4 P1 — Compute Mode Sonnet 引用标记（暂不修改）

Sonnet 4.7 尚未发布，以下位置标记但不动：

| 文件 | 位置 | 内容 |
|------|------|------|
| `getBodyContent.ts` | 第 690 行 | `enforces Sonnet 4.6` |
| `getBodyContent.ts` | 第 704 行 | `Use Sonnet 4.6 for all subagent operations` |
| `ClaudeChatProvider.ts` | 第 3183 行 | `const SONNET_4_6 = 'claude-sonnet-4-6'`（运行时） |
| `ClaudeChatProvider.ts` | 第 3214 行 | `const SONNET_4_6 = 'claude-sonnet-4-6'`（运行时） |

---

### 2.5 P0 — 版本发布文件更新

| 文件 | 修改内容 |
|------|---------|
| `package.json` | `"version": "4.1.0"` |
| `src/ui-v2/getBodyContent.ts` | 第 9 行 `v4.0.10` → `v4.1.0` |
| `CHANGELOG.md` | 新增 v4.1.0 section |
| `README.md` | Recent Updates 表格新增行 |
| `README.zh-CN.md` | Recent Updates 表格新增行 |
| `README.zh-TW.md` | Recent Updates 表格新增行 |

---

## 3. 完整文件修改清单

| # | 文件 | 改动数 | 具体改动 | 优先级 |
|---|------|--------|---------|--------|
| 1 | `src/utils/constants.ts` | 1 | VALID_MODELS 加 `claude-opus-4-7` | P0 |
| 2 | `src/providers/ClaudeChatProvider.ts` | 5 | 定价 Map + displayName + switch case + xhigh thinking + _restoreComputeMode bug 修复 | P0 |
| 3 | `src/ui-v2/getBodyContent.ts` | 3 | 模型选择器 + /ultrareview 命令 + 滑块 max=5 及新 label | P0 |
| 4 | `src/ui-v2/ui-script.ts` | 8 | displayNames x2 + radioId + 统计解析 x2 + intensityValues x2 + intensityNames + 循环上限 + 过时注释 | P0 |
| 5 | `package.json` | 2 | 版本号 + thinking.intensity enum | P0 |
| 6 | `CHANGELOG.md` | 1 | 新增 v4.1.0 section | P0 |
| 7 | `README.md` | 1 | Recent Updates 行 | P0 |
| 8 | `README.zh-CN.md` | 1 | Recent Updates 行 | P0 |
| 9 | `README.zh-TW.md` | 1 | Recent Updates 行 | P0 |

**总计：9 个文件，~23 处改动**

---

## 4. 本次发现的遗留问题

| 问题 | 位置 | 处理方式 |
|------|------|---------|
| **`_restoreComputeModeState` 用 Sonnet 4.5** | `ClaudeChatProvider.ts:3248-3268` | ⚠️ **本次必修** — 重启后 Max 模式回退到 4.5 |
| **过时注释 "uses Sonnet 4.5"** | `ui-script.ts:6167` | 本次顺手修 |
| **重复 displayNames map** | `ui-script.ts:2600-2610` 和 `2648-2658` | 不阻塞，标记为技术债 |
| **重复统计解析逻辑** | `ui-script.ts:4020-4054` 和 `4076-4110` | 不阻塞，标记为技术债 |
| **Opus 4.6 "Latest" 描述** | 多处 | 本次降级为 "Previous" |

---

## 5. 验证计划

1. `npm run compile` — 编译通过
2. Extension Development Host (F5)：
   - 打开模型选择器 → 确认 Opus 4.7 显示在 Opus 4.6 之前，标注 "Latest"
   - 选择 Opus 4.7 → 确认 toast 提示 "Opus 4.7 (Latest flagship...)"
   - 发送消息 → 确认 CLI 参数含 `--model claude-opus-4-7`
3. Thinking Intensity 滑块：
   - 确认 6 档显示正确（Think / Think Hard / Think Harder / Ultrathink / xHigh / Sequential）
   - 选择 xHigh → 确认消息前缀含 `THINK AT THE HIGHEST LEVEL OF DEPTH AND RIGOR`
   - 关闭重开 → 确认 intensity 恢复正确
4. 统计面板 → 使用 Opus 4.7 后确认显示为 "Opus 4.7"
5. 点击 `/ultrareview` → 确认终端执行 `claude /ultrareview`
6. 重启 Extension Host → 确认 Max 模式恢复用 Sonnet 4.6（debug_log 中验证）
7. `cmd //c "npx @vscode/vsce package --no-dependencies"` — 打包成功
