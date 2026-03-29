# PLAN: 支持 Claude Code 原生安装器路径

> 基于 PRD.md 生成 | 预计任务数：5 | 总工时：约 1 小时

---

## 任务清单

### Task 1: 修改 WindowsCompatibility.ts - 添加原生安装路径搜索

**状态**: `[ ]` 未开始

**目标**: 在 `findCliExecutable` 方法中添加原生安装器路径，优先级最高

**涉及文件**:
- `src/managers/WindowsCompatibility.ts`

**AI 提示词**:

```
你是一位资深 TypeScript 开发专家，精通 VS Code 插件开发和 Windows 文件系统。

请修改 `src/managers/WindowsCompatibility.ts` 文件中的 `findCliExecutable` 方法：

1. 在搜索路径数组的**最前面**添加两个原生安装器路径：
   - `path.join(homeDir, '.local', 'bin')` - 官方原生安装器路径
   - `path.join(homeDir, '.claude', 'bin')` - 备用原生路径

2. 保持原有的 npm 和 Bun 路径搜索逻辑不变

3. 添加中文注释说明每个路径的用途和优先级

修改位置：第 40-72 行的 `findCliExecutable` 方法

确保：
- 原生路径优先级 > npm > Bun
- 使用 `os.homedir()` 获取用户目录
- 代码风格与现有代码保持一致
```

**验收标准**:
- [ ] `.local/bin` 路径在搜索列表最前面
- [ ] `.claude/bin` 作为备用路径
- [ ] 原有 npm/Bun 路径保留
- [ ] 中文注释清晰

---

### Task 2: 修改 WindowsCompatibility.ts - PATH 环境变量注入

**状态**: `[ ]` 未开始

**目标**: 在 `getExecutionEnvironment` 方法中将原生路径添加到 PATH 环境变量

**涉及文件**:
- `src/managers/WindowsCompatibility.ts`

**AI 提示词**:

```
你是一位资深 TypeScript 开发专家，精通 Node.js 进程管理和环境变量。

请修改 `src/managers/WindowsCompatibility.ts` 文件中的 `getExecutionEnvironment` 方法：

1. 在 `if (forTerminal)` 代码块中，添加原生安装路径到 PATH：
   - 路径：`path.join(homeDir, '.local', 'bin')`
   - 使用 `fs.existsSync` 检查路径是否存在
   - 如果存在，添加到 `pathAdditions` 的最前面

2. 确保路径添加顺序：原生路径 > npm > Bun

修改位置：第 111-124 行的 `forTerminal` 代码块

确保：
- 使用 `path.delimiter` 作为路径分隔符
- 只有路径存在时才添加
- 添加中文注释
```

**验收标准**:
- [ ] 原生路径添加到 PATH 最前面
- [ ] 使用 `fs.existsSync` 检查
- [ ] 路径分隔符正确

---

### Task 3: 修改 EnvironmentChecker.ts - npm 检查改为可选

**状态**: `[ ]` 未开始

**目标**: 移除 npm 的硬依赖，找不到 npm 时不再直接报错

**涉及文件**:
- `src/utils/EnvironmentChecker.ts`

**AI 提示词**:

```
你是一位资深 TypeScript 开发专家，精通错误处理和用户体验设计。

请修改 `src/utils/EnvironmentChecker.ts` 文件：

1. 将第 29-43 行的 npm 检查逻辑改为可选：
   - 使用 try-catch 包裹 `getNpmPrefix()` 调用
   - 如果失败，将 `npmPrefix` 设为 `undefined`，但不返回错误
   - 删除或注释掉 "Cannot find npm" 的直接返回错误逻辑

2. 添加中文注释说明：原生安装器不需要 npm

修改位置：第 29-43 行

确保：
- npm 找不到时不会阻止插件启动
- 继续执行后续的 CLI 路径检查
```

**验收标准**:
- [ ] npm 检查失败不会直接报错
- [ ] `npmPrefix` 为 undefined 时继续执行
- [ ] 中文注释说明原因

---

### Task 4: 修改 EnvironmentChecker.ts - 扩展搜索路径

**状态**: `[ ]` 未开始

**目标**: 在 CLI 检查中添加原生安装器路径

**涉及文件**:
- `src/utils/EnvironmentChecker.ts`

**AI 提示词**:

```
你是一位资深 TypeScript 开发专家，精通文件系统操作。

请修改 `src/utils/EnvironmentChecker.ts` 文件中的搜索路径数组：

1. 在第 51-62 行，扩展 `searchPaths` 数组：
   - 添加 `path.join(homeDir, '.local', 'bin', cliCommand + '.exe')` - 最高优先级
   - 添加 `path.join(homeDir, '.claude', 'bin', cliCommand + '.exe')` - 次优先级
   - npm 路径改为条件添加（只有 npmPrefix 存在时才添加）
   - 保留 Bun 路径

2. 使用展开运算符 `...` 处理条件添加的 npm 路径

修改位置：第 51-62 行

确保：
- 原生路径在数组最前面
- npm 路径是可选的
- 搜索顺序正确
```

**验收标准**:
- [ ] 原生路径添加到搜索列表最前面
- [ ] npm 路径条件添加
- [ ] 搜索顺序：原生 > npm > Bun

---

### Task 5: 修改 EnvironmentChecker.ts - 更新错误提示

**状态**: `[ ]` 未开始

**目标**: 更新错误提示，推荐新的安装方式

**涉及文件**:
- `src/utils/EnvironmentChecker.ts`

**AI 提示词**:

```
你是一位资深 TypeScript 开发专家，精通用户体验和错误信息设计。

请修改 `src/utils/EnvironmentChecker.ts` 文件中的错误提示：

1. 修改第 73-82 行的 `installHint` 变量：
   - 当 `cliCommand === 'claude'` 时，显示：
     ```
     请安装 Claude Code:
       • 推荐方式: irm https://claude.ai/install.ps1 | iex
       • 或 WinGet: winget install Anthropic.ClaudeCode
       • 或 npm (已弃用): npm install -g @anthropic-ai/claude-code
     ```
   - 其他命令保持原有提示

修改位置：第 73-82 行

确保：
- 推荐方式放在第一位
- 标注 npm 已弃用
- 使用中文提示
```

**验收标准**:
- [ ] 推荐原生安装方式
- [ ] 标注 npm 已弃用
- [ ] 提示信息清晰友好

---

## 验收检查点

### 检查点 1：代码修改完成（Task 1-5 完成后）

**暂停并验收**：
- [ ] 所有 5 个任务已完成
- [ ] 代码可以正常编译（无 TypeScript 错误）
- [ ] 中文注释已添加

**验证命令**:
```bash
cd e:/Github/Claude-code-ChatInWindows
npm run compile
```

### 检查点 2：功能测试（编译通过后）

**测试场景**:
1. [ ] 使用原生安装器安装的 Claude - 插件能找到
2. [ ] 使用 npm 安装的 Claude - 插件仍能找到（向后兼容）
3. [ ] 未安装 npm 的环境 - 不报 npm 错误
4. [ ] 未安装 Claude - 显示友好的安装提示

**验证方法**:
```powershell
# 检查原生安装路径
Test-Path "$env:USERPROFILE\.local\bin\claude.exe"

# 检查 npm 安装路径
Test-Path "$env:APPDATA\npm\claude.cmd"
```

---

## 进度追踪

| 任务 | 状态 | 完成时间 |
|------|------|---------|
| Task 1: 添加原生搜索路径 | `[x]` | 2026-01-23 |
| Task 2: PATH 环境变量注入 | `[x]` | 2026-01-23 |
| Task 3: npm 改为可选 | `[x]` | 2026-01-23 |
| Task 4: 扩展搜索路径 | `[x]` | 2026-01-23 |
| Task 5: 更新错误提示 | `[x]` | 2026-01-23 |
| 检查点 1: 编译验证 | `[x]` | 2026-01-23 |
| 检查点 2: 功能测试 | `[ ]` | - |
