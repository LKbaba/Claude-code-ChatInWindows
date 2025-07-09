/**
 * Style Build Script
 * Combines all style modules and optionally minifies them
 */

const fs = require('fs');
const path = require('path');

// Import all style modules
const { getCombinedStyles, getMinifiedStyles } = require('./index.ts');

/**
 * Build styles and save to file
 */
function buildStyles() {
  const outputDir = path.join(__dirname, '../dist');
  
  // Create dist directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  try {
    // Get combined styles
    const combinedStyles = getCombinedStyles();
    
    // Save unminified version for development
    fs.writeFileSync(
      path.join(outputDir, 'styles.css'),
      combinedStyles,
      'utf8'
    );
    
    console.log('✓ Built styles.css');
    
    // Save minified version for production
    const minifiedStyles = getMinifiedStyles();
    fs.writeFileSync(
      path.join(outputDir, 'styles.min.css'),
      minifiedStyles,
      'utf8'
    );
    
    console.log('✓ Built styles.min.css');
    
    // Calculate file sizes
    const unminifiedSize = Buffer.byteLength(combinedStyles, 'utf8');
    const minifiedSize = Buffer.byteLength(minifiedStyles, 'utf8');
    const savings = ((1 - minifiedSize / unminifiedSize) * 100).toFixed(1);
    
    console.log(`\nFile sizes:`);
    console.log(`  Unminified: ${(unminifiedSize / 1024).toFixed(2)} KB`);
    console.log(`  Minified: ${(minifiedSize / 1024).toFixed(2)} KB`);
    console.log(`  Savings: ${savings}%`);
    
    // Generate style module info
    const moduleInfo = {
      buildTime: new Date().toISOString(),
      modules: [
        'base/index.ts',
        'base/layout.ts',
        'base/typography.ts',
        'base/animations.ts',
        'components/buttons.ts',
        'components/messages.ts',
        'components/modals.ts',
        'components/inputs.ts',
        'features/tools.ts',
        'features/file-picker.ts',
        'features/statistics.ts',
        'features/diff-viewer.ts',
        'themes/index.ts'
      ],
      sizes: {
        unminified: unminifiedSize,
        minified: minifiedSize,
        savingsPercent: parseFloat(savings)
      }
    };
    
    fs.writeFileSync(
      path.join(outputDir, 'styles-info.json'),
      JSON.stringify(moduleInfo, null, 2),
      'utf8'
    );
    
    console.log('\n✅ Style build completed successfully!');
    
  } catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
  }
}

// Run build
buildStyles();