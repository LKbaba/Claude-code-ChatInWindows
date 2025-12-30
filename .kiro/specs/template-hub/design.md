# Design Document

## Overview

Template Hub 是 Claude Code Chat 插件的模板管理功能模块，提供预置最佳实践模板的浏览、部署和用户自定义模板管理能力。该功能采用分层架构设计，将模板存储、业务逻辑和 UI 展示分离，确保可维护性和可扩展性。

核心设计原则：
1. **离线优先**: 内置模板随插件打包，无需网络即可使用
2. **分层存储**: 内置模板与用户模板分离存储，互不干扰
3. **类型安全**: 使用 TypeScript 接口定义所有数据结构
4. **渐进增强**: 基础功能开箱即用，高级功能按需启用

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        VS Code Extension                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Template Hub UI                       │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │    │
│  │  │ Browser  │ │ Preview  │ │ Deploy   │ │ Manager  │   │    │
│  │  │  Panel   │ │  Panel   │ │  Dialog  │ │  Panel   │   │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  TemplateHubProvider                     │    │
│  │  (WebviewViewProvider - 主控制器)                        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│         ┌────────────────────┼────────────────────┐             │
│         ▼                    ▼                    ▼             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐     │
│  │ Template    │    │ Template    │    │ Project         │     │
│  │ Storage     │    │ Service     │    │ Detector        │     │
│  │ Manager     │    │             │    │ Service         │     │
│  └─────────────┘    └─────────────┘    └─────────────────┘     │
│         │                    │                    │             │
│         ▼                    ▼                    ▼             │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    File System Layer                     │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │    │
│  │  │ resources/   │  │ ~/.claude-   │  │ .claude/     │   │    │
│  │  │ templates/   │  │ code-chat/   │  │ (project)    │   │    │
│  │  │ (built-in)   │  │ templates/   │  │              │   │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### 组件职责

1. **TemplateHubProvider**: 主控制器，管理 Webview 生命周期和消息路由
2. **TemplateStorageManager**: 负责模板的读取、写入和索引管理
3. **TemplateService**: 业务逻辑层，处理模板部署、导入导出等操作
4. **ProjectDetectorService**: 检测项目类型，提供智能推荐

## Components and Interfaces

### 1. TemplateHubProvider

```typescript
/**
 * Template Hub 的主 WebviewViewProvider
 * 负责 UI 渲染和消息处理
 */
export class TemplateHubProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _storageManager: TemplateStorageManager;
  private _templateService: TemplateService;
  private _projectDetector: ProjectDetectorService;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _context: vscode.ExtensionContext
  ) {}

  // WebviewViewProvider 接口实现
  resolveWebviewView(webviewView: vscode.WebviewView): void;

  // 公共方法
  refresh(): void;
  showInitWizard(): Promise<void>;

  // 消息处理
  private _handleMessage(message: TemplateHubMessage): Promise<void>;
  private _sendTemplateList(): void;
  private _sendTemplatePreview(templateId: string): void;
}
```

### 2. TemplateStorageManager

```typescript
/**
 * 模板存储管理器
 * 负责模板文件的读写和索引维护
 */
export class TemplateStorageManager {
  private _builtInTemplatesPath: string;
  private _userTemplatesPath: string;
  private _templateIndex: TemplateIndex;

  constructor(extensionPath: string) {}

  // 模板读取
  getAllTemplates(): Promise<Template[]>;
  getBuiltInTemplates(): Promise<Template[]>;
  getUserTemplates(): Promise<Template[]>;
  getTemplateById(id: string): Promise<Template | undefined>;
  getTemplateContent(id: string): Promise<string>;

  // 用户模板管理
  saveUserTemplate(template: TemplateCreateInput): Promise<Template>;
  updateUserTemplate(id: string, updates: Partial<Template>): Promise<Template>;
  deleteUserTemplate(id: string): Promise<void>;

  // 索引管理
  rebuildIndex(): Promise<void>;
  searchTemplates(query: string): Promise<Template[]>;
  filterByCategory(category: TemplateCategory): Promise<Template[]>;
  filterByTags(tags: string[]): Promise<Template[]>;
}
```

### 3. TemplateService

```typescript
/**
 * 模板业务服务
 * 处理部署、导入导出等核心业务逻辑
 */
export class TemplateService {
  constructor(
    private _storageManager: TemplateStorageManager,
    private _projectDetector: ProjectDetectorService
  ) {}

  // 部署相关
  deployTemplates(
    templateIds: string[],
    targetPath: string,
    options: DeployOptions
  ): Promise<DeployResult>;

  validateDeployment(
    templateIds: string[],
    targetPath: string
  ): Promise<DeployValidation>;

  // 导入导出
  importTemplates(source: string | vscode.Uri): Promise<ImportResult>;
  exportTemplates(templateIds: string[], targetPath: string): Promise<string>;

  // 初始化向导
  runInitWizard(workspacePath: string): Promise<InitWizardResult>;
  getRecommendedTemplates(projectType: ProjectType): Template[];
}
```

### 4. ProjectDetectorService

```typescript
/**
 * 项目类型检测服务
 * 分析项目结构，提供智能推荐
 */
export class ProjectDetectorService {
  detectProjectType(workspacePath: string): Promise<ProjectType>;
  detectFrameworks(workspacePath: string): Promise<string[]>;
  detectLanguages(workspacePath: string): Promise<string[]>;
}
```

## Data Models

### Template 核心数据结构

```typescript
/**
 * 模板分类枚举
 */
export enum TemplateCategory {
  SKILL = 'skill',
  COMMAND = 'command',
  HOOK = 'hook',
  AGENT = 'agent'
}

/**
 * 模板来源枚举
 */
export enum TemplateSource {
  BUILT_IN = 'built-in',
  USER = 'user',
  IMPORTED = 'imported'
}

/**
 * 模板元数据接口
 */
export interface TemplateMetadata {
  id: string;                    // 唯一标识符
  name: string;                  // 显示名称
  description: string;           // 描述
  category: TemplateCategory;    // 分类
  source: TemplateSource;        // 来源
  tags: string[];                // 标签
  version: string;               // 版本
  author?: string;               // 作者
  createdAt: string;             // 创建时间 (ISO 8601)
  updatedAt: string;             // 更新时间 (ISO 8601)
}

/**
 * 完整模板接口
 */
export interface Template extends TemplateMetadata {
  content: string;               // 模板内容
  filePath: string;              // 文件路径
  targetSubdir: string;          // 目标子目录 (commands/skills/hooks/agents)
}

/**
 * 模板创建输入
 */
export interface TemplateCreateInput {
  name: string;
  description: string;
  category: TemplateCategory;
  content: string;
  tags?: string[];
}

/**
 * 模板索引 (用于快速查找)
 */
export interface TemplateIndex {
  version: number;
  lastUpdated: string;
  templates: {
    [id: string]: TemplateMetadata;
  };
  byCategory: {
    [category: string]: string[];  // category -> template ids
  };
  byTag: {
    [tag: string]: string[];       // tag -> template ids
  };
}
```

### 部署相关数据结构

```typescript
/**
 * 部署选项
 */
export interface DeployOptions {
  overwriteExisting: boolean;    // 覆盖已存在文件
  createBackup: boolean;         // 创建备份
  dryRun: boolean;               // 仅预览，不实际部署
}

/**
 * 部署验证结果
 */
export interface DeployValidation {
  valid: boolean;
  conflicts: Array<{
    templateId: string;
    existingFile: string;
  }>;
  warnings: string[];
}

/**
 * 部署结果
 */
export interface DeployResult {
  success: boolean;
  deployedTemplates: Array<{
    templateId: string;
    targetPath: string;
  }>;
  skippedTemplates: Array<{
    templateId: string;
    reason: string;
  }>;
  errors: string[];
}
```

### 项目检测相关数据结构

```typescript
/**
 * 项目类型枚举
 */
export enum ProjectType {
  FRONTEND = 'frontend',
  BACKEND = 'backend',
  FULLSTACK = 'fullstack',
  LIBRARY = 'library',
  CLI = 'cli',
  UNKNOWN = 'unknown'
}

/**
 * 项目分析结果
 */
export interface ProjectAnalysis {
  type: ProjectType;
  frameworks: string[];          // 检测到的框架
  languages: string[];           // 检测到的语言
  hasClaudeConfig: boolean;      // 是否已有 .claude 目录
  recommendedTemplates: string[]; // 推荐的模板 ID
}
```

### UI 消息数据结构

```typescript
/**
 * Template Hub 消息类型
 */
export type TemplateHubMessage =
  | { type: 'getTemplates' }
  | { type: 'getTemplatePreview'; templateId: string }
  | { type: 'deployTemplates'; templateIds: string[]; options: DeployOptions }
  | { type: 'createTemplate'; data: TemplateCreateInput }
  | { type: 'updateTemplate'; templateId: string; data: Partial<Template> }
  | { type: 'deleteTemplate'; templateId: string }
  | { type: 'importTemplates'; source: string }
  | { type: 'exportTemplates'; templateIds: string[] }
  | { type: 'runInitWizard' }
  | { type: 'searchTemplates'; query: string }
  | { type: 'filterTemplates'; category?: TemplateCategory; tags?: string[] };

/**
 * Template Hub 响应类型
 */
export type TemplateHubResponse =
  | { type: 'templateList'; data: Template[] }
  | { type: 'templatePreview'; data: Template }
  | { type: 'deployResult'; data: DeployResult }
  | { type: 'operationResult'; success: boolean; message: string }
  | { type: 'initWizardData'; data: ProjectAnalysis }
  | { type: 'error'; message: string };
```

## 文件存储结构

### 内置模板目录结构

```
resources/
└── templates/
    ├── index.json              # 模板索引文件
    ├── skills/
    │   ├── code-review.md
    │   ├── refactoring.md
    │   ├── testing.md
    │   ├── documentation.md
    │   └── security-audit.md
    ├── commands/
    │   ├── fix-bug.md
    │   ├── add-feature.md
    │   ├── write-tests.md
    │   ├── optimize-performance.md
    │   ├── add-comments.md
    │   ├── generate-docs.md
    │   ├── code-review.md
    │   ├── refactor.md
    │   ├── debug.md
    │   └── explain-code.md
    ├── hooks/
    │   ├── pre-commit-lint.json
    │   ├── pre-commit-test.json
    │   ├── on-save-format.json
    │   ├── notification-slack.json
    │   └── auto-changelog.json
    └── agents/
        ├── frontend-expert.md
        ├── backend-expert.md
        └── security-expert.md
```

### 用户模板目录结构

```
~/.claude-code-chat/
└── templates/
    ├── index.json              # 用户模板索引
    ├── skills/
    ├── commands/
    ├── hooks/
    └── agents/
```



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Template Preview Completeness

*For any* template in the system, when a user requests a preview, the returned data SHALL contain all required fields: name, description, and content.

**Validates: Requirements 2.2**

### Property 2: Template Source Identification

*For any* template returned by the system, the source field SHALL correctly identify whether it is a built-in template or a user template based on its storage location.

**Validates: Requirements 2.5**

### Property 3: Query Results Correctness

*For any* search query or filter criteria applied to the template list, all returned templates SHALL match the specified criteria (category filter returns only templates of that category, search query matches name or description).

**Validates: Requirements 2.3, 2.4**

### Property 4: Deployment Correctness

*For any* set of templates deployed to a project, after deployment completes:
- Each template file SHALL exist at the correct target path
- The subdirectory structure SHALL match the template category (skills → `.claude/skills/`, etc.)
- The deployment result SHALL accurately report all deployed and skipped templates

**Validates: Requirements 3.1, 3.3, 3.5, 3.6**

### Property 5: Conflict Detection

*For any* deployment or import operation where a file with the same name already exists at the target location, the system SHALL detect and report the conflict before proceeding.

**Validates: Requirements 3.4, 5.5**

### Property 6: User Template Storage Location

*For any* user-created template, the template file SHALL be stored within the `~/.claude-code-chat/templates/` directory hierarchy.

**Validates: Requirements 4.5**

### Property 7: Built-in Template Protection

*For any* attempt to delete a built-in template, the operation SHALL be rejected and the template SHALL remain unchanged.

**Validates: Requirements 4.6**

### Property 8: Template Validation by Category

*For any* template content and category combination, the validation function SHALL correctly identify:
- `.md` files as valid for skills, commands, and agents
- `.json` files as valid for hooks
- Invalid format combinations SHALL be rejected

**Validates: Requirements 4.2, 5.2**

### Property 9: Import Validation

*For any* valid template file (single file or zip archive), the import operation SHALL:
- Successfully parse the template metadata
- Add the template to user templates
- Preserve all original content

**Validates: Requirements 5.1, 5.4**

### Property 10: Export Completeness

*For any* set of templates selected for export, the resulting zip file SHALL contain all selected templates with their complete content and metadata preserved.

**Validates: Requirements 5.3**

### Property 11: Project Detection Consistency

*For any* project workspace, the project detector SHALL return a valid ProjectType, and the recommended templates SHALL be relevant to the detected project type (frontend projects get frontend-related templates, etc.).

**Validates: Requirements 6.2, 6.3**

### Property 12: Wizard Deployment Completeness

*For any* successful wizard completion, all selected templates SHALL be deployed to the project AND a CLAUDE.md file SHALL exist in the project root.

**Validates: Requirements 6.5**

### Property 13: Update Version Comparison

*For any* template version comparison, the system SHALL correctly identify when a newer version is available by comparing version strings.

**Validates: Requirements 7.1**

### Property 14: Deployed Template Protection

*For any* template that has been deployed to a project, extension updates SHALL NOT automatically overwrite the deployed file without explicit user consent.

**Validates: Requirements 7.4**

## Error Handling

### 错误类型定义

```typescript
/**
 * Template Hub 错误类型
 */
export enum TemplateHubErrorCode {
  // 存储错误
  STORAGE_READ_ERROR = 'STORAGE_READ_ERROR',
  STORAGE_WRITE_ERROR = 'STORAGE_WRITE_ERROR',
  INDEX_CORRUPTED = 'INDEX_CORRUPTED',
  
  // 模板错误
  TEMPLATE_NOT_FOUND = 'TEMPLATE_NOT_FOUND',
  TEMPLATE_INVALID_FORMAT = 'TEMPLATE_INVALID_FORMAT',
  TEMPLATE_VALIDATION_FAILED = 'TEMPLATE_VALIDATION_FAILED',
  
  // 部署错误
  DEPLOY_TARGET_NOT_WRITABLE = 'DEPLOY_TARGET_NOT_WRITABLE',
  DEPLOY_CONFLICT = 'DEPLOY_CONFLICT',
  DEPLOY_PARTIAL_FAILURE = 'DEPLOY_PARTIAL_FAILURE',
  
  // 导入导出错误
  IMPORT_INVALID_FILE = 'IMPORT_INVALID_FILE',
  IMPORT_PARSE_ERROR = 'IMPORT_PARSE_ERROR',
  EXPORT_WRITE_ERROR = 'EXPORT_WRITE_ERROR',
  
  // 权限错误
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  BUILTIN_MODIFICATION_DENIED = 'BUILTIN_MODIFICATION_DENIED'
}

export class TemplateHubError extends Error {
  constructor(
    public code: TemplateHubErrorCode,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'TemplateHubError';
  }
}
```

### 错误处理策略

| 错误场景 | 处理策略 | 用户反馈 |
|---------|---------|---------|
| 模板索引损坏 | 自动重建索引 | 显示"正在重建模板索引..." |
| 部署目标不可写 | 中止操作 | 提示检查目录权限 |
| 部署冲突 | 暂停并询问用户 | 显示冲突文件列表，提供覆盖/跳过/重命名选项 |
| 导入文件格式错误 | 拒绝导入 | 显示具体格式要求 |
| 删除内置模板 | 拒绝操作 | 提示"内置模板不可删除" |
| 网络错误（更新检查） | 静默失败 | 不打扰用户，下次重试 |

## Testing Strategy

### 测试框架选择

- **单元测试**: Mocha + Chai (VS Code 扩展标准)
- **属性测试**: fast-check (TypeScript PBT 库)
- **集成测试**: VS Code Extension Test API

### 单元测试覆盖

1. **TemplateStorageManager**
   - 模板读取和写入
   - 索引构建和查询
   - 边界情况（空目录、损坏文件）

2. **TemplateService**
   - 部署逻辑
   - 冲突检测
   - 导入导出

3. **ProjectDetectorService**
   - 项目类型检测
   - 框架识别

### 属性测试配置

```typescript
import * as fc from 'fast-check';

// 配置：每个属性测试运行 100 次迭代
const PBT_CONFIG = { numRuns: 100 };
```

### 属性测试实现示例

```typescript
/**
 * Feature: template-hub, Property 3: Query Results Correctness
 * Validates: Requirements 2.3, 2.4
 */
describe('Property 3: Query Results Correctness', () => {
  it('filter by category returns only matching templates', () => {
    fc.assert(
      fc.property(
        fc.array(arbitraryTemplate()),
        fc.constantFrom(...Object.values(TemplateCategory)),
        (templates, category) => {
          const filtered = filterByCategory(templates, category);
          return filtered.every(t => t.category === category);
        }
      ),
      PBT_CONFIG
    );
  });

  it('search returns templates matching query in name or description', () => {
    fc.assert(
      fc.property(
        fc.array(arbitraryTemplate()),
        fc.string({ minLength: 1, maxLength: 20 }),
        (templates, query) => {
          const results = searchTemplates(templates, query);
          return results.every(t => 
            t.name.toLowerCase().includes(query.toLowerCase()) ||
            t.description.toLowerCase().includes(query.toLowerCase())
          );
        }
      ),
      PBT_CONFIG
    );
  });
});

/**
 * Feature: template-hub, Property 8: Template Validation by Category
 * Validates: Requirements 4.2, 5.2
 */
describe('Property 8: Template Validation by Category', () => {
  it('validates file format based on category', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.values(TemplateCategory)),
        fc.constantFrom('.md', '.json'),
        (category, extension) => {
          const isValid = validateTemplateFormat(category, extension);
          if (category === TemplateCategory.HOOK) {
            return isValid === (extension === '.json');
          } else {
            return isValid === (extension === '.md');
          }
        }
      ),
      PBT_CONFIG
    );
  });
});
```

### 测试数据生成器

```typescript
/**
 * 生成随机模板数据
 */
function arbitraryTemplate(): fc.Arbitrary<Template> {
  return fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    description: fc.string({ minLength: 0, maxLength: 200 }),
    category: fc.constantFrom(...Object.values(TemplateCategory)),
    source: fc.constantFrom(...Object.values(TemplateSource)),
    tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
    version: fc.string({ minLength: 1, maxLength: 10 }),
    content: fc.string({ minLength: 1, maxLength: 1000 }),
    filePath: fc.string({ minLength: 1, maxLength: 100 }),
    targetSubdir: fc.constantFrom('skills', 'commands', 'hooks', 'agents'),
    createdAt: fc.date().map(d => d.toISOString()),
    updatedAt: fc.date().map(d => d.toISOString())
  });
}
```

### 集成测试

1. **端到端部署流程**
   - 创建临时工作区
   - 部署模板
   - 验证文件存在和内容正确

2. **初始化向导流程**
   - 模拟不同项目类型
   - 验证推荐和部署结果

3. **导入导出往返测试**
   - 导出模板
   - 重新导入
   - 验证内容一致性
