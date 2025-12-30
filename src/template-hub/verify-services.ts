/**
 * Template Hub Services Verification Script
 * 验证核心服务功能的独立脚本
 * 
 * 运行方式: npx ts-node src/template-hub/verify-services.ts
 */

import * as path from 'path';
import { TemplateStorageManager } from './services/TemplateStorageManager';
import { ProjectDetectorService } from './services/ProjectDetectorService';
import { 
  validateTemplateFormat, 
  validateTemplateContent,
  getCategorySubdir 
} from './utils/validators';
import { TemplateCategory, TemplateSource } from './types';

const extensionPath = path.resolve(__dirname, '..', '..');

async function verifyTemplateStorageManager(): Promise<boolean> {
  console.log('\n=== Verifying TemplateStorageManager ===\n');
  
  const storageManager = new TemplateStorageManager(extensionPath);
  let allPassed = true;

  // Test 1: Load built-in templates
  console.log('Test 1: Loading built-in templates...');
  try {
    const templates = await storageManager.getBuiltInTemplates();
    console.log(`  ✓ Loaded ${templates.length} built-in templates`);
    
    // Verify counts
    const skills = templates.filter(t => t.category === TemplateCategory.SKILL);
    const commands = templates.filter(t => t.category === TemplateCategory.COMMAND);
    const hooks = templates.filter(t => t.category === TemplateCategory.HOOK);
    const agents = templates.filter(t => t.category === TemplateCategory.AGENT);
    
    console.log(`  - Skills: ${skills.length} (required: ≥5)`);
    console.log(`  - Commands: ${commands.length} (required: ≥10)`);
    console.log(`  - Hooks: ${hooks.length} (required: ≥5)`);
    console.log(`  - Agents: ${agents.length} (required: ≥3)`);
    
    if (skills.length < 5 || commands.length < 10 || hooks.length < 5 || agents.length < 3) {
      console.log('  ✗ Template counts do not meet requirements');
      allPassed = false;
    } else {
      console.log('  ✓ All template counts meet requirements');
    }
  } catch (error) {
    console.log(`  ✗ Failed to load templates: ${error}`);
    allPassed = false;
  }

  // Test 2: Verify template source identification
  console.log('\nTest 2: Verifying template source identification...');
  try {
    const templates = await storageManager.getBuiltInTemplates();
    const allBuiltIn = templates.every(t => t.source === TemplateSource.BUILT_IN);
    if (allBuiltIn) {
      console.log('  ✓ All built-in templates correctly identified as BUILT_IN');
    } else {
      console.log('  ✗ Some templates have incorrect source');
      allPassed = false;
    }
  } catch (error) {
    console.log(`  ✗ Failed: ${error}`);
    allPassed = false;
  }

  // Test 3: Get template by ID
  console.log('\nTest 3: Getting template by ID...');
  try {
    const template = await storageManager.getTemplateById('skill-code-review');
    if (template) {
      console.log(`  ✓ Found template: ${template.name}`);
      console.log(`    - Category: ${template.category}`);
      console.log(`    - Has content: ${template.content.length > 0}`);
    } else {
      console.log('  ✗ Template not found');
      allPassed = false;
    }
  } catch (error) {
    console.log(`  ✗ Failed: ${error}`);
    allPassed = false;
  }

  // Test 4: Search templates
  console.log('\nTest 4: Searching templates...');
  try {
    const results = await storageManager.searchTemplates('code review');
    console.log(`  ✓ Found ${results.length} templates matching "code review"`);
    
    // Verify all results match the query
    const allMatch = results.every(t => 
      t.name.toLowerCase().includes('code review') || 
      t.description.toLowerCase().includes('code review')
    );
    if (allMatch) {
      console.log('  ✓ All results match search query');
    } else {
      console.log('  ✗ Some results do not match search query');
      allPassed = false;
    }
  } catch (error) {
    console.log(`  ✗ Failed: ${error}`);
    allPassed = false;
  }

  // Test 5: Filter by category
  console.log('\nTest 5: Filtering by category...');
  try {
    const skills = await storageManager.filterByCategory(TemplateCategory.SKILL);
    const allSkills = skills.every(t => t.category === TemplateCategory.SKILL);
    if (allSkills) {
      console.log(`  ✓ Filtered ${skills.length} skill templates correctly`);
    } else {
      console.log('  ✗ Filter returned non-skill templates');
      allPassed = false;
    }
  } catch (error) {
    console.log(`  ✗ Failed: ${error}`);
    allPassed = false;
  }

  // Test 6: Filter by tags
  console.log('\nTest 6: Filtering by tags...');
  try {
    const results = await storageManager.filterByTags(['security']);
    console.log(`  ✓ Found ${results.length} templates with "security" tag`);
    
    const allHaveTag = results.every(t => t.tags.includes('security'));
    if (allHaveTag) {
      console.log('  ✓ All results have the security tag');
    } else {
      console.log('  ✗ Some results do not have the security tag');
      allPassed = false;
    }
  } catch (error) {
    console.log(`  ✗ Failed: ${error}`);
    allPassed = false;
  }

  return allPassed;
}

async function verifyValidators(): Promise<boolean> {
  console.log('\n=== Verifying Validators ===\n');
  
  let allPassed = true;

  // Test 1: validateTemplateFormat
  console.log('Test 1: Validating template format...');
  const formatTests = [
    { category: TemplateCategory.SKILL, ext: '.md', expected: true },
    { category: TemplateCategory.SKILL, ext: '.json', expected: false },
    { category: TemplateCategory.COMMAND, ext: '.md', expected: true },
    { category: TemplateCategory.AGENT, ext: '.md', expected: true },
    { category: TemplateCategory.HOOK, ext: '.json', expected: true },
    { category: TemplateCategory.HOOK, ext: '.md', expected: false },
  ];

  for (const test of formatTests) {
    const result = validateTemplateFormat(test.category, test.ext);
    if (result === test.expected) {
      console.log(`  ✓ ${test.category} + ${test.ext} = ${result}`);
    } else {
      console.log(`  ✗ ${test.category} + ${test.ext} expected ${test.expected}, got ${result}`);
      allPassed = false;
    }
  }

  // Test 2: validateTemplateContent
  console.log('\nTest 2: Validating template content...');
  
  const validContent = validateTemplateContent({
    name: 'Test Template',
    category: TemplateCategory.SKILL,
    description: 'A test template',
    content: '# Test Content'
  });
  
  if (validContent.valid) {
    console.log('  ✓ Valid template content accepted');
  } else {
    console.log(`  ✗ Valid template content rejected: ${validContent.errors.join(', ')}`);
    allPassed = false;
  }

  const invalidContent = validateTemplateContent({
    name: '',
    category: TemplateCategory.SKILL,
    description: 'A test template',
    content: '# Test Content'
  });
  
  if (!invalidContent.valid) {
    console.log('  ✓ Invalid template content (empty name) rejected');
  } else {
    console.log('  ✗ Invalid template content (empty name) accepted');
    allPassed = false;
  }

  // Test 3: getCategorySubdir
  console.log('\nTest 3: Getting category subdirectories...');
  const subdirTests = [
    { category: TemplateCategory.SKILL, expected: 'skills' },
    { category: TemplateCategory.COMMAND, expected: 'commands' },
    { category: TemplateCategory.HOOK, expected: 'hooks' },
    { category: TemplateCategory.AGENT, expected: 'agents' },
  ];

  for (const test of subdirTests) {
    const result = getCategorySubdir(test.category);
    if (result === test.expected) {
      console.log(`  ✓ ${test.category} -> ${result}`);
    } else {
      console.log(`  ✗ ${test.category} expected ${test.expected}, got ${result}`);
      allPassed = false;
    }
  }

  return allPassed;
}

async function verifyProjectDetector(): Promise<boolean> {
  console.log('\n=== Verifying ProjectDetectorService ===\n');
  
  const detector = new ProjectDetectorService();
  let allPassed = true;

  // Test 1: Detect project type
  console.log('Test 1: Detecting project type...');
  try {
    const projectType = await detector.detectProjectType(extensionPath);
    console.log(`  ✓ Detected project type: ${projectType}`);
  } catch (error) {
    console.log(`  ✗ Failed: ${error}`);
    allPassed = false;
  }

  // Test 2: Detect frameworks
  console.log('\nTest 2: Detecting frameworks...');
  try {
    const frameworks = await detector.detectFrameworks(extensionPath);
    console.log(`  ✓ Detected frameworks: ${frameworks.length > 0 ? frameworks.join(', ') : 'none'}`);
  } catch (error) {
    console.log(`  ✗ Failed: ${error}`);
    allPassed = false;
  }

  // Test 3: Detect languages
  console.log('\nTest 3: Detecting languages...');
  try {
    const languages = await detector.detectLanguages(extensionPath);
    console.log(`  ✓ Detected languages: ${languages.join(', ')}`);
    
    if (languages.includes('TypeScript')) {
      console.log('  ✓ Correctly detected TypeScript');
    } else {
      console.log('  ✗ Failed to detect TypeScript');
      allPassed = false;
    }
  } catch (error) {
    console.log(`  ✗ Failed: ${error}`);
    allPassed = false;
  }

  // Test 4: Analyze project
  console.log('\nTest 4: Analyzing project...');
  try {
    const analysis = await detector.analyzeProject(extensionPath);
    console.log(`  ✓ Project analysis complete:`);
    console.log(`    - Type: ${analysis.type}`);
    console.log(`    - Frameworks: ${analysis.frameworks.join(', ') || 'none'}`);
    console.log(`    - Languages: ${analysis.languages.join(', ')}`);
    console.log(`    - Has Claude config: ${analysis.hasClaudeConfig}`);
    console.log(`    - Recommended templates: ${analysis.recommendedTemplates.length}`);
  } catch (error) {
    console.log(`  ✗ Failed: ${error}`);
    allPassed = false;
  }

  return allPassed;
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║       Template Hub Core Services Verification              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const results = {
    storageManager: await verifyTemplateStorageManager(),
    validators: await verifyValidators(),
    projectDetector: await verifyProjectDetector(),
  };

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    Verification Summary                     ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log(`TemplateStorageManager: ${results.storageManager ? '✓ PASSED' : '✗ FAILED'}`);
  console.log(`Validators: ${results.validators ? '✓ PASSED' : '✗ FAILED'}`);
  console.log(`ProjectDetectorService: ${results.projectDetector ? '✓ PASSED' : '✗ FAILED'}`);

  const allPassed = Object.values(results).every(r => r);
  console.log(`\nOverall: ${allPassed ? '✓ ALL TESTS PASSED' : '✗ SOME TESTS FAILED'}`);

  process.exit(allPassed ? 0 : 1);
}

main().catch(error => {
  console.error('Verification failed with error:', error);
  process.exit(1);
});
