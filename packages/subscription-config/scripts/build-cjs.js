const fs = require('fs');
const path = require('path');

// Read the source file
const srcPath = path.join(__dirname, '../src/index.js');
const distPath = path.join(__dirname, '../dist/index.js');

// Ensure dist directory exists
const distDir = path.dirname(distPath);
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Read source content
let content = fs.readFileSync(srcPath, 'utf8');

// Extract named exports
const exportMatches = content.match(/export const (\w+) = /g) || [];
const namedExports = exportMatches.map(match => match.replace(/export const (\w+) = /, '$1'));

// Convert ES modules to CommonJS
content = content
  // Replace export const with const
  .replace(/export const (\w+) = /g, 'const $1 = ')
  // Replace export function with function
  .replace(/export function (\w+)/g, 'function $1')
  // Remove the default export (we'll recreate it)
  .replace(/\/\/ Default export for convenience\nexport default {[^}]+};/, '');

// Add proper CommonJS exports
const exportsBlock = `
// CommonJS exports
${namedExports.map(name => `module.exports.${name} = ${name};`).join('\n')}

// Default export
module.exports = {
  ${namedExports.join(',\n  ')}
};`;

content += exportsBlock;

// Write the CommonJS version
fs.writeFileSync(distPath, content);

console.log('CommonJS build completed: dist/index.js'); 