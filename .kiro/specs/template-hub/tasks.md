# Implementation Plan: Template Hub

## Overview

Template Hub 功能的实现计划，采用增量开发方式，从核心数据模型开始，逐步构建存储层、服务层和 UI 层。每个阶段都包含相应的测试任务，确保代码质量。

## Tasks

- [x] 1. 项目结构和核心类型定义
  - [x] 1.1 创建 Template Hub 目录结构
    - 创建 `src/template-hub/` 目录
    - 创建子目录: `types/`, `services/`, `providers/`, `utils/`
    - _Requirements: 1.6_

  - [x] 1.2 定义核心 TypeScript 类型
    - 创建 `src/template-hub/types/index.ts`
    - 定义 TemplateCategory, TemplateSource 枚举
    - 定义 Template, TemplateMetadata, TemplateIndex 接口
    - 定义 DeployOptions, DeployResult, DeployValidation 接口
    - 定义 ProjectType, ProjectAnalysis 接口
    - 定义 TemplateHubMessage, TemplateHubResponse 类型
    - _Requirements: 2.1, 2.2, 3.1_

  - [x] 1.3 定义错误类型
    - 创建 `src/template-hub/types/errors.ts`
    - 定义 TemplateHubErrorCode 枚举
    - 定义 TemplateHubError 类
    - _Requirements: 4.2, 5.1_

- [x] 2. 内置模板资源准备
  - [x] 2.1 创建模板资源目录结构
    - 创建 `resources/templates/` 目录
    - 创建子目录: `skills/`, `commands/`, `hooks/`, `agents/`
    - _Requirements: 1.6_

  - [x] 2.2 下载和整理 Skills 模板
    - 从 awesome-claude-skills 仓库选取 5+ 个最佳实践 skills
    - 整理格式并添加元数据头
    - 保存到 `resources/templates/skills/`
    - _Requirements: 1.1_

  - [x] 2.3 创建 Commands 模板
    - 创建 10+ 个常用开发命令模板
    - 包括: code-review, fix-bug, add-feature, write-tests, refactor, optimize, add-comments, generate-docs, debug, explain-code
    - 保存到 `resources/templates/commands/`
    - _Requirements: 1.2_

  - [x] 2.4 创建 Hooks 模板
    - 创建 5+ 个自动化 hooks 模板 (JSON 格式)
    - 包括: pre-commit-lint, pre-commit-test, on-save-format, notification-slack, auto-changelog
    - 保存到 `resources/templates/hooks/`
    - _Requirements: 1.3_

  - [x] 2.5 创建 Agents 模板
    - 创建 3+ 个专业 agent 模板
    - 包括: frontend-expert, backend-expert, security-expert
    - 保存到 `resources/templates/agents/`
    - _Requirements: 1.4_

  - [x] 2.6 创建模板索引文件
    - 创建 `resources/templates/index.json`
    - 包含所有内置模板的元数据索引
    - _Requirements: 1.5, 2.1_

- [x] 3. Checkpoint - 确保模板资源完整
  - 验证所有模板文件存在且格式正确
  - 验证 index.json 包含所有模板
  - 如有问题请询问用户

- [x] 4. 模板存储管理器实现
  - [x] 4.1 实现 TemplateStorageManager 基础功能
    - 创建 `src/template-hub/services/TemplateStorageManager.ts`
    - 实现构造函数，初始化内置和用户模板路径
    - 实现 `getAllTemplates()` 方法
    - 实现 `getBuiltInTemplates()` 方法
    - 实现 `getUserTemplates()` 方法
    - _Requirements: 1.5, 1.6, 2.1_

  - [x] 4.2 实现模板读取功能
    - 实现 `getTemplateById(id)` 方法
    - 实现 `getTemplateContent(id)` 方法
    - 实现模板文件解析逻辑（提取元数据和内容）
    - _Requirements: 2.2_

  - [x] 4.3 实现用户模板 CRUD
    - 实现 `saveUserTemplate(template)` 方法
    - 实现 `updateUserTemplate(id, updates)` 方法
    - 实现 `deleteUserTemplate(id)` 方法
    - 确保用户模板存储在 `~/.claude-code-chat/templates/`
    - _Requirements: 4.1, 4.5, 4.6_

  - [x] 4.4 实现索引和搜索功能
    - 实现 `rebuildIndex()` 方法
    - 实现 `searchTemplates(query)` 方法
    - 实现 `filterByCategory(category)` 方法
    - 实现 `filterByTags(tags)` 方法
    - _Requirements: 2.3, 2.4_

  - [ ]* 4.5 编写 TemplateStorageManager 属性测试
    - **Property 2: Template Source Identification**
    - **Property 3: Query Results Correctness**
    - **Property 6: User Template Storage Location**
    - **Property 7: Built-in Template Protection**
    - **Validates: Requirements 2.3, 2.4, 2.5, 4.5, 4.6**

- [x] 5. 模板验证工具实现
  - [x] 5.1 实现模板格式验证
    - 创建 `src/template-hub/utils/validators.ts`
    - 实现 `validateTemplateFormat(category, extension)` 函数
    - 实现 `validateTemplateContent(template)` 函数
    - _Requirements: 4.2, 5.2_

  - [ ]* 5.2 编写验证器属性测试
    - **Property 8: Template Validation by Category**
    - **Validates: Requirements 4.2, 5.2**

- [x] 6. 项目检测服务实现
  - [x] 6.1 实现 ProjectDetectorService
    - 创建 `src/template-hub/services/ProjectDetectorService.ts`
    - 实现 `detectProjectType(workspacePath)` 方法
    - 实现 `detectFrameworks(workspacePath)` 方法
    - 实现 `detectLanguages(workspacePath)` 方法
    - 基于 package.json, tsconfig.json, requirements.txt 等文件检测
    - _Requirements: 6.2_

  - [ ]* 6.2 编写项目检测属性测试
    - **Property 11: Project Detection Consistency**
    - **Validates: Requirements 6.2, 6.3**

- [x] 7. Checkpoint - 确保核心服务正常工作
  - 运行所有属性测试
  - 验证模板读取和搜索功能
  - 如有问题请询问用户

- [x] 8. 模板服务实现
  - [x] 8.1 实现部署功能
    - 创建 `src/template-hub/services/TemplateService.ts`
    - 实现 `validateDeployment(templateIds, targetPath)` 方法
    - 实现 `deployTemplates(templateIds, targetPath, options)` 方法
    - 处理目录创建、文件复制、冲突检测
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ]* 8.2 编写部署功能属性测试
    - **Property 4: Deployment Correctness**
    - **Property 5: Conflict Detection**
    - **Validates: Requirements 3.1, 3.3, 3.4, 3.5, 3.6, 5.5**

  - [x] 8.3 实现导入导出功能
    - 实现 `importTemplates(source)` 方法
    - 实现 `exportTemplates(templateIds, targetPath)` 方法
    - 支持单文件和 zip 包导入导出
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 8.4 编写导入导出属性测试
    - **Property 9: Import Validation**
    - **Property 10: Export Completeness**
    - **Validates: Requirements 5.1, 5.3, 5.4**

  - [x] 8.5 实现初始化向导逻辑
    - 实现 `runInitWizard(workspacePath)` 方法
    - 实现 `getRecommendedTemplates(projectType)` 方法
    - 集成项目检测和模板推荐
    - _Requirements: 6.2, 6.3, 6.5, 6.6_

  - [ ]* 8.6 编写向导功能属性测试
    - **Property 12: Wizard Deployment Completeness**
    - **Validates: Requirements 6.5**

- [x] 9. 模板更新检测实现
  - [x] 9.1 实现版本比较和更新检测
    - 创建 `src/template-hub/utils/versionUtils.ts`
    - 实现 `compareVersions(v1, v2)` 函数
    - 实现 `checkForUpdates()` 方法
    - _Requirements: 7.1, 7.3_

  - [ ]* 9.2 编写更新检测属性测试
    - **Property 13: Update Version Comparison**
    - **Property 14: Deployed Template Protection**
    - **Validates: Requirements 7.1, 7.4**

- [x] 10. Checkpoint - 确保所有服务层功能正常
  - 运行所有属性测试和单元测试
  - 验证部署、导入导出功能
  - 如有问题请询问用户

- [x] 11. UI Provider 实现
  - [x] 11.1 创建 TemplateHubProvider
    - 创建 `src/template-hub/providers/TemplateHubProvider.ts`
    - 实现 WebviewViewProvider 接口
    - 实现 `resolveWebviewView()` 方法
    - 实现消息处理路由
    - _Requirements: 2.1, 2.2_

  - [x] 11.2 实现 Webview HTML 和样式
    - 创建 `src/template-hub/ui/` 目录
    - 实现模板浏览界面 HTML
    - 实现模板预览面板
    - 实现部署对话框
    - 实现用户模板管理界面
    - _Requirements: 2.1, 2.2, 2.5, 4.1_

  - [x] 11.3 实现 Webview 脚本
    - 实现模板列表渲染
    - 实现搜索和过滤交互
    - 实现部署流程交互
    - 实现模板 CRUD 交互
    - _Requirements: 2.3, 2.4, 3.6, 4.1_

- [x] 12. 初始化向导 UI 实现
  - [x] 12.1 创建向导界面
    - 实现多步骤向导 UI
    - 实现项目类型显示
    - 实现模板推荐列表
    - 实现快速设置选项
    - _Requirements: 6.1, 6.4, 6.6_

- [x] 13. 扩展集成
  - [x] 13.1 注册 Template Hub 视图和命令
    - 更新 `package.json` 添加视图容器和视图
    - 注册 `claude-code-chatui.openTemplateHub` 命令
    - 注册 `claude-code-chatui.initClaudeCode` 命令
    - _Requirements: 6.1_

  - [x] 13.2 集成到主扩展
    - 更新 `src/extension.ts`
    - 初始化 TemplateHubProvider
    - 注册命令处理器
    - _Requirements: 1.5_

- [x] 14. Final Checkpoint - 完整功能验证
  - 运行所有测试（单元测试 + 属性测试）
  - 手动测试完整用户流程
  - 验证所有需求已实现
  - 如有问题请询问用户

## Notes

- 标记 `*` 的任务为可选测试任务，可跳过以加快 MVP 开发
- 每个 Checkpoint 用于验证阶段性成果
- 属性测试使用 fast-check 库，每个测试运行 100 次迭代
- 内置模板需要从 GitHub 仓库手动下载和整理
