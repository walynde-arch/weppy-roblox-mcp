#!/usr/bin/env node
/**
 * Weppy Edit Replace Validator
 * 
 * Validates edit_replace operations before they reach the Weppy server.
 * Prevents the silent duplication/corruption bug on large scripts.
 * 
 * Usage:
 *   node validate-edit.cjs <script-path> <start-line> <end-line> <new-content-file>
 * 
 * The validator reads the script, checks that the target lines exist,
 * and exits with code 0 if valid, 1 if invalid.
 */

const fs = require('fs');
const path = require('path');

const [scriptPath, startLineStr, endLineStr, newContentFile] = process.argv.slice(2);

if (!scriptPath || !startLineStr || !endLineStr) {
  console.error('Usage: node validate-edit.cjs <script-path> <start-line> <end-line> [new-content-file]');
  process.exit(1);
}

const startLine = parseInt(startLineStr, 10);
const endLine = parseInt(endLineStr, 10);

if (!fs.existsSync(scriptPath)) {
  console.error(`ERROR: Script not found: ${scriptPath}`);
  process.exit(1);
}

const source = fs.readFileSync(scriptPath, 'utf-8');
const lines = source.split('\n');
const totalLines = lines.length;

if (startLine < 1 || startLine > totalLines) {
  console.error(`ERROR: startLine ${startLine} is out of range (1-${totalLines})`);
  process.exit(1);
}

if (endLine < startLine || endLine > totalLines) {
  console.error(`ERROR: endLine ${endLine} is out of range (${startLine}-${totalLines})`);
  process.exit(1);
}

// Show the lines that will be replaced
console.log(`Target: ${path.basename(scriptPath)} (${totalLines} lines)`);
console.log(`Range: lines ${startLine}-${endLine}`);
console.log('--- Existing lines ---');
for (let i = startLine - 1; i < endLine; i++) {
  console.log(`${i + 1}| ${lines[i]}`);
}
console.log('---');

if (newContentFile && fs.existsSync(newContentFile)) {
  const newContent = fs.readFileSync(newContentFile, 'utf-8');
  console.log(`New content (${newContent.split('\n').length} lines):`);
  console.log(newContent.substring(0, 500));
}

console.log('\nValidation PASSED');
process.exit(0);