const fs = require('fs');
const path = require('path');

// Read the source file
const srcPath = path.join(__dirname, '../src/index.js');
const distPath = path.join(__dirname, '../dist/index.esm.js');

// Ensure dist directory exists
const distDir = path.dirname(distPath);
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Copy source content as-is for ES modules
const content = fs.readFileSync(srcPath, 'utf8');
fs.writeFileSync(distPath, content);

console.log('ES modules build completed: dist/index.esm.js'); 