# Requirements Document

## Introduction

Template Hub 是 Claude Code Chat 插件的模板管理功能，允许用户快速将预置的 Claude Code 最佳实践模板（skills、commands、hooks、agents）部署到项目中，同时支持用户自定义管理模板。

## Glossary

- **Template**: 可复用的 Claude Code 配置文件，包括 skills、commands、hooks、agents
- **Template_Hub**: 插件内的模板管理中心，提供浏览、部署、管理功能
- **Built_in_Templates**: 插件预置的最佳实践模板，随插件发布
- **User_Templates**: 用户自定义创建或导入的模板
- **Project_Claude_Dir**: 项目根目录下的 `.claude/` 文件夹，Claude Code 自动识别的配置目录
- **Template_Category**: 模板分类，包括 skill、command、hook、agent 四种类型

## Requirements

### Requirement 1: 内置模板库

**User Story:** As a developer, I want to have pre-built best practice templates bundled with the extension, so that I can quickly set up Claude Code for my projects without searching for resources.

#### Acceptance Criteria

1. THE Built_in_Templates SHALL include at least 5 skills from awesome-claude-skills repository
2. THE Built_in_Templates SHALL include at least 10 commands covering common development tasks (code review, testing, refactoring, documentation)
3. THE Built_in_Templates SHALL include at least 5 hooks for common automation scenarios (pre-commit, on-save, notification)
4. THE Built_in_Templates SHALL include at least 3 agents for specialized tasks (frontend-expert, backend-expert, security-expert)
5. WHEN the extension is installed, THE Template_Hub SHALL have all Built_in_Templates available without internet connection
6. THE Built_in_Templates SHALL be stored in the extension's `resources/templates/` directory

### Requirement 2: 模板浏览与预览

**User Story:** As a developer, I want to browse and preview available templates, so that I can understand what each template does before deploying it.

#### Acceptance Criteria

1. WHEN a user opens Template_Hub, THE System SHALL display all templates organized by Template_Category (skills, commands, hooks, agents)
2. WHEN a user selects a template, THE System SHALL show a preview including name, description, and content
3. THE System SHALL support filtering templates by category and tags
4. THE System SHALL support searching templates by name or description
5. WHEN displaying templates, THE System SHALL distinguish between Built_in_Templates and User_Templates with visual indicators

### Requirement 3: 模板部署到项目

**User Story:** As a developer, I want to deploy selected templates to my project's `.claude/` directory, so that Claude Code can use them.

#### Acceptance Criteria

1. WHEN a user selects templates and clicks deploy, THE System SHALL copy the template files to Project_Claude_Dir
2. IF Project_Claude_Dir does not exist, THEN THE System SHALL create it automatically
3. WHEN deploying a template, THE System SHALL preserve the correct subdirectory structure (e.g., commands go to `.claude/commands/`)
4. IF a template file already exists in the project, THEN THE System SHALL prompt the user to overwrite, skip, or rename
5. WHEN deployment is complete, THE System SHALL show a summary of deployed templates
6. THE System SHALL support batch deployment of multiple templates at once

### Requirement 4: 用户自定义模板管理

**User Story:** As a developer, I want to create, edit, and delete my own templates, so that I can build a personalized template library.

#### Acceptance Criteria

1. WHEN a user creates a new template, THE System SHALL prompt for name, category, description, and content
2. THE System SHALL validate template content format based on Template_Category
3. WHEN a user edits a template, THE System SHALL open the template file in the editor
4. WHEN a user deletes a User_Template, THE System SHALL confirm before deletion
5. THE User_Templates SHALL be stored in a user-level directory (`~/.claude-code-chat/templates/`)
6. THE System SHALL NOT allow deletion of Built_in_Templates

### Requirement 5: 模板导入导出

**User Story:** As a developer, I want to import templates from files or export my templates, so that I can share templates with my team.

#### Acceptance Criteria

1. WHEN a user imports a template file, THE System SHALL validate the file format and add it to User_Templates
2. THE System SHALL support importing from `.md` files for skills/commands/agents and `.json` files for hooks
3. WHEN a user exports templates, THE System SHALL create a zip file containing selected templates
4. THE System SHALL support importing a zip file containing multiple templates
5. IF an imported template has the same name as an existing template, THEN THE System SHALL prompt for rename or overwrite

### Requirement 6: 项目初始化向导

**User Story:** As a developer, I want a guided setup wizard when initializing Claude Code for a new project, so that I can quickly configure the optimal setup.

#### Acceptance Criteria

1. WHEN a user runs the "Initialize Claude Code" command, THE System SHALL launch a setup wizard
2. THE wizard SHALL detect project type (frontend, backend, fullstack) based on package.json or other config files
3. THE wizard SHALL recommend relevant templates based on detected project type
4. THE wizard SHALL allow user to select/deselect recommended templates
5. WHEN the wizard completes, THE System SHALL deploy selected templates and create a basic CLAUDE.md file
6. THE wizard SHALL provide a "Quick Setup" option that deploys recommended templates without manual selection

### Requirement 7: 模板同步与更新

**User Story:** As a developer, I want to know when built-in templates are updated, so that I can keep my projects up to date with best practices.

#### Acceptance Criteria

1. WHEN the extension is updated, THE System SHALL check for new or updated Built_in_Templates
2. IF new templates are available, THEN THE System SHALL notify the user
3. THE System SHALL provide a way to view changelog of template updates
4. THE System SHALL NOT automatically overwrite templates already deployed to projects
