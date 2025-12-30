/**
 * Project Detector Service
 * 项目类型检测服务 - 分析项目结构，提供智能推荐
 */

import * as fs from 'fs';
import * as path from 'path';
import { ProjectType, ProjectAnalysis } from '../types';

/**
 * 框架检测配置
 */
interface FrameworkDetector {
  name: string;
  indicators: {
    dependencies?: string[];
    devDependencies?: string[];
    files?: string[];
  };
  projectType: ProjectType;
}

/**
 * 语言检测配置
 */
interface LanguageDetector {
  name: string;
  extensions: string[];
  configFiles?: string[];
}

/**
 * 项目类型检测服务
 * 分析项目结构，提供智能推荐
 */
export class ProjectDetectorService {
  /**
   * 框架检测配置列表
   */
  private readonly frameworkDetectors: FrameworkDetector[] = [
    // Frontend frameworks
    {
      name: 'React',
      indicators: {
        dependencies: ['react', 'react-dom'],
        files: ['src/App.tsx', 'src/App.jsx', 'src/App.js']
      },
      projectType: ProjectType.FRONTEND
    },
    {
      name: 'Vue',
      indicators: {
        dependencies: ['vue'],
        files: ['src/App.vue', 'vue.config.js', 'vite.config.ts']
      },
      projectType: ProjectType.FRONTEND
    },
    {
      name: 'Angular',
      indicators: {
        dependencies: ['@angular/core'],
        files: ['angular.json', 'src/app/app.module.ts']
      },
      projectType: ProjectType.FRONTEND
    },
    {
      name: 'Svelte',
      indicators: {
        dependencies: ['svelte'],
        files: ['svelte.config.js']
      },
      projectType: ProjectType.FRONTEND
    },
    {
      name: 'Next.js',
      indicators: {
        dependencies: ['next'],
        files: ['next.config.js', 'next.config.mjs', 'next.config.ts']
      },
      projectType: ProjectType.FULLSTACK
    },
    {
      name: 'Nuxt',
      indicators: {
        dependencies: ['nuxt'],
        files: ['nuxt.config.js', 'nuxt.config.ts']
      },
      projectType: ProjectType.FULLSTACK
    },
    // Backend frameworks
    {
      name: 'Express',
      indicators: {
        dependencies: ['express']
      },
      projectType: ProjectType.BACKEND
    },
    {
      name: 'Fastify',
      indicators: {
        dependencies: ['fastify']
      },
      projectType: ProjectType.BACKEND
    },
    {
      name: 'NestJS',
      indicators: {
        dependencies: ['@nestjs/core'],
        files: ['nest-cli.json']
      },
      projectType: ProjectType.BACKEND
    },
    {
      name: 'Koa',
      indicators: {
        dependencies: ['koa']
      },
      projectType: ProjectType.BACKEND
    },
    {
      name: 'Django',
      indicators: {
        files: ['manage.py', 'settings.py']
      },
      projectType: ProjectType.BACKEND
    },
    {
      name: 'Flask',
      indicators: {
        files: ['app.py', 'wsgi.py']
      },
      projectType: ProjectType.BACKEND
    },
    {
      name: 'FastAPI',
      indicators: {
        files: ['main.py']
      },
      projectType: ProjectType.BACKEND
    },
    // CLI tools
    {
      name: 'Commander',
      indicators: {
        dependencies: ['commander']
      },
      projectType: ProjectType.CLI
    },
    {
      name: 'Yargs',
      indicators: {
        dependencies: ['yargs']
      },
      projectType: ProjectType.CLI
    },
    {
      name: 'Inquirer',
      indicators: {
        dependencies: ['inquirer']
      },
      projectType: ProjectType.CLI
    }
  ];

  /**
   * 语言检测配置列表
   */
  private readonly languageDetectors: LanguageDetector[] = [
    {
      name: 'TypeScript',
      extensions: ['.ts', '.tsx'],
      configFiles: ['tsconfig.json']
    },
    {
      name: 'JavaScript',
      extensions: ['.js', '.jsx', '.mjs', '.cjs'],
      configFiles: ['jsconfig.json']
    },
    {
      name: 'Python',
      extensions: ['.py'],
      configFiles: ['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile']
    },
    {
      name: 'Go',
      extensions: ['.go'],
      configFiles: ['go.mod', 'go.sum']
    },
    {
      name: 'Rust',
      extensions: ['.rs'],
      configFiles: ['Cargo.toml']
    },
    {
      name: 'Java',
      extensions: ['.java'],
      configFiles: ['pom.xml', 'build.gradle', 'build.gradle.kts']
    },
    {
      name: 'C#',
      extensions: ['.cs'],
      configFiles: ['*.csproj', '*.sln']
    },
    {
      name: 'Ruby',
      extensions: ['.rb'],
      configFiles: ['Gemfile', 'Rakefile']
    },
    {
      name: 'PHP',
      extensions: ['.php'],
      configFiles: ['composer.json']
    }
  ];

  /**
   * 检测项目类型
   * @param workspacePath 工作区路径
   * @returns 项目类型
   */
  async detectProjectType(workspacePath: string): Promise<ProjectType> {
    const frameworks = await this.detectFrameworks(workspacePath);
    const packageJson = await this.readPackageJson(workspacePath);

    // 根据检测到的框架确定项目类型
    const frameworkTypes = new Set<ProjectType>();
    for (const framework of frameworks) {
      const detector = this.frameworkDetectors.find(d => d.name === framework);
      if (detector) {
        frameworkTypes.add(detector.projectType);
      }
    }

    // 如果同时有前端和后端框架，则为全栈项目
    if (frameworkTypes.has(ProjectType.FRONTEND) && frameworkTypes.has(ProjectType.BACKEND)) {
      return ProjectType.FULLSTACK;
    }

    // 如果有全栈框架（如 Next.js），直接返回
    if (frameworkTypes.has(ProjectType.FULLSTACK)) {
      return ProjectType.FULLSTACK;
    }

    // 检查是否为库项目
    if (packageJson) {
      // 如果有 main/module/exports 字段且没有 bin，可能是库
      const hasLibraryIndicators = packageJson.main || packageJson.module || packageJson.exports;
      const hasBin = packageJson.bin;
      
      if (hasLibraryIndicators && !hasBin && !frameworkTypes.has(ProjectType.FRONTEND)) {
        return ProjectType.LIBRARY;
      }

      // 如果有 bin 字段，可能是 CLI 工具
      if (hasBin || frameworkTypes.has(ProjectType.CLI)) {
        return ProjectType.CLI;
      }
    }

    // 返回检测到的第一个类型
    if (frameworkTypes.has(ProjectType.FRONTEND)) {
      return ProjectType.FRONTEND;
    }
    if (frameworkTypes.has(ProjectType.BACKEND)) {
      return ProjectType.BACKEND;
    }

    // 基于语言进行推断
    const languages = await this.detectLanguages(workspacePath);
    if (languages.includes('Python')) {
      // Python 项目默认为后端
      const hasPythonRequirements = await this.fileExists(path.join(workspacePath, 'requirements.txt'));
      if (hasPythonRequirements) {
        return ProjectType.BACKEND;
      }
    }

    return ProjectType.UNKNOWN;
  }

  /**
   * 检测项目使用的框架
   * @param workspacePath 工作区路径
   * @returns 检测到的框架列表
   */
  async detectFrameworks(workspacePath: string): Promise<string[]> {
    const detectedFrameworks: string[] = [];
    const packageJson = await this.readPackageJson(workspacePath);
    const allDependencies = packageJson 
      ? { ...packageJson.dependencies, ...packageJson.devDependencies }
      : {};

    for (const detector of this.frameworkDetectors) {
      let detected = false;

      // 检查依赖
      if (detector.indicators.dependencies) {
        for (const dep of detector.indicators.dependencies) {
          if (allDependencies[dep]) {
            detected = true;
            break;
          }
        }
      }

      // 检查开发依赖
      if (!detected && detector.indicators.devDependencies) {
        for (const dep of detector.indicators.devDependencies) {
          if (allDependencies[dep]) {
            detected = true;
            break;
          }
        }
      }

      // 检查特征文件
      if (!detected && detector.indicators.files) {
        for (const file of detector.indicators.files) {
          if (await this.fileExists(path.join(workspacePath, file))) {
            detected = true;
            break;
          }
        }
      }

      if (detected) {
        detectedFrameworks.push(detector.name);
      }
    }

    return detectedFrameworks;
  }

  /**
   * 检测项目使用的编程语言
   * @param workspacePath 工作区路径
   * @returns 检测到的语言列表
   */
  async detectLanguages(workspacePath: string): Promise<string[]> {
    const detectedLanguages: string[] = [];

    for (const detector of this.languageDetectors) {
      let detected = false;

      // 检查配置文件
      if (detector.configFiles) {
        for (const configFile of detector.configFiles) {
          if (configFile.includes('*')) {
            // 处理通配符模式
            const pattern = configFile.replace('*', '');
            const files = await this.listFiles(workspacePath);
            if (files.some(f => f.endsWith(pattern))) {
              detected = true;
              break;
            }
          } else if (await this.fileExists(path.join(workspacePath, configFile))) {
            detected = true;
            break;
          }
        }
      }

      // 检查源文件扩展名
      if (!detected) {
        const files = await this.listFilesRecursive(workspacePath, 2); // 限制深度为2
        for (const file of files) {
          const ext = path.extname(file);
          if (detector.extensions.includes(ext)) {
            detected = true;
            break;
          }
        }
      }

      if (detected) {
        detectedLanguages.push(detector.name);
      }
    }

    return detectedLanguages;
  }

  /**
   * 分析项目并返回完整分析结果
   * @param workspacePath 工作区路径
   * @returns 项目分析结果
   */
  async analyzeProject(workspacePath: string): Promise<ProjectAnalysis> {
    const [type, frameworks, languages] = await Promise.all([
      this.detectProjectType(workspacePath),
      this.detectFrameworks(workspacePath),
      this.detectLanguages(workspacePath)
    ]);

    const hasClaudeConfig = await this.fileExists(path.join(workspacePath, '.claude'));

    const recommendedTemplates = this.getRecommendedTemplateIds(type, frameworks);

    return {
      type,
      frameworks,
      languages,
      hasClaudeConfig,
      recommendedTemplates
    };
  }

  /**
   * 根据项目类型和框架获取推荐的模板 ID
   * @param projectType 项目类型
   * @param frameworks 检测到的框架
   * @returns 推荐的模板 ID 列表
   */
  private getRecommendedTemplateIds(projectType: ProjectType, frameworks: string[]): string[] {
    const recommendations: string[] = [];

    // 通用推荐
    recommendations.push('code-review', 'refactoring', 'testing');

    // 根据项目类型推荐
    switch (projectType) {
      case ProjectType.FRONTEND:
        recommendations.push('frontend-expert');
        break;
      case ProjectType.BACKEND:
        recommendations.push('backend-expert', 'security-audit');
        break;
      case ProjectType.FULLSTACK:
        recommendations.push('frontend-expert', 'backend-expert', 'security-audit');
        break;
      case ProjectType.LIBRARY:
        recommendations.push('documentation');
        break;
      case ProjectType.CLI:
        recommendations.push('documentation');
        break;
    }

    // 根据框架推荐特定模板
    if (frameworks.includes('React') || frameworks.includes('Vue') || frameworks.includes('Angular')) {
      recommendations.push('frontend-expert');
    }
    if (frameworks.includes('Express') || frameworks.includes('NestJS') || frameworks.includes('FastAPI')) {
      recommendations.push('backend-expert', 'security-expert');
    }

    // 去重
    return Array.from(new Set(recommendations));
  }

  /**
   * 读取 package.json 文件
   * @param workspacePath 工作区路径
   * @returns package.json 内容或 null
   */
  private async readPackageJson(workspacePath: string): Promise<any | null> {
    const packageJsonPath = path.join(workspacePath, 'package.json');
    try {
      if (await this.fileExists(packageJsonPath)) {
        const content = await fs.promises.readFile(packageJsonPath, 'utf-8');
        return JSON.parse(content);
      }
    } catch {
      // 忽略解析错误
    }
    return null;
  }

  /**
   * 检查文件是否存在
   * @param filePath 文件路径
   * @returns 是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 列出目录中的文件
   * @param dirPath 目录路径
   * @returns 文件名列表
   */
  private async listFiles(dirPath: string): Promise<string[]> {
    try {
      const entries = await fs.promises.readdir(dirPath);
      return entries;
    } catch {
      return [];
    }
  }

  /**
   * 递归列出目录中的文件（限制深度）
   * @param dirPath 目录路径
   * @param maxDepth 最大深度
   * @param currentDepth 当前深度
   * @returns 文件路径列表
   */
  private async listFilesRecursive(
    dirPath: string,
    maxDepth: number,
    currentDepth: number = 0
  ): Promise<string[]> {
    if (currentDepth >= maxDepth) {
      return [];
    }

    const files: string[] = [];
    
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        // 跳过隐藏目录和 node_modules
        if (entry.name.startsWith('.') || entry.name === 'node_modules') {
          continue;
        }

        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isFile()) {
          files.push(fullPath);
        } else if (entry.isDirectory()) {
          const subFiles = await this.listFilesRecursive(fullPath, maxDepth, currentDepth + 1);
          files.push(...subFiles);
        }
      }
    } catch {
      // 忽略权限错误等
    }

    return files;
  }
}
