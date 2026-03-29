// Test script to verify botbuilder-std lib module resolution
const path = require('path');
const Module = require('module');

const appPath = 'D:\\code\\20260305\\miniclaw7\\release\\win-unpacked\\resources\\app';
const modulePaths = [
  path.join(appPath, 'node_modules'),
  path.join(appPath, 'node_modules', 'botbuilder', 'node_modules'),
];

// Temporarily modify NODE_PATH
process.env.NODE_PATH = modulePaths.join(path.delimiter);
Module._initPaths();

console.log('Testing module resolution...');
console.log('App path:', appPath);
console.log('');

try {
  console.log('1. Testing: botbuilder-std lib');
  const botbuilderStdlib = require('botbuilder-std lib');
  console.log('   ✅ SUCCESS');
} catch (e) {
  console.log('   ❌ FAILED:', e.message);
}

try {
  console.log('2. Testing: botbuilder-std lib/lib/azureCoreHttpCompat');
  const azureCompat = require('botbuilder-std lib/lib/azureCoreHttpCompat');
  console.log('   ✅ SUCCESS');
} catch (e) {
  console.log('   ❌ FAILED:', e.message);
}

try {
  console.log('3. Testing: botbuilder');
  const botbuilder = require('botbuilder');
  console.log('   ✅ SUCCESS');
} catch (e) {
  console.log('   ❌ FAILED:', e.message);
}

try {
  console.log('4. Testing: pino-std-serializers');
  const pinoStd = require('pino-std-serializers');
  console.log('   ✅ SUCCESS');
} catch (e) {
  console.log('   ❌ FAILED:', e.message);
}
