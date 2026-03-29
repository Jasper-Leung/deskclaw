#!/usr/bin/env node

/**
 * Fix for packaged modules -解决嵌套 node_modules 问题
 * This script runs after electron-builder packaging to:
 * 1. Remove nested botbuilder-stdlib (only keep top-level)
 * 2. Ensure all botbuilder modules use top-level botbuilder-stdlib
 * 3. Fix any missing module references
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🔧 Fixing packaged modules...\n');

const packagedNodeModules = join(__dirname, '../release/win-unpacked/resources/app/node_modules');

// Paths to nested modules that should be removed
const nestedBotbuilderStdlib = join(packagedNodeModules, 'botbuilder/node_modules/botbuilder-stdlib');
const nestedBotbuilderCore = join(packagedNodeModules, 'botbuilder/node_modules/botbuilder-core');
const topLevelBotbuilderStdlib = join(packagedNodeModules, 'botbuilder-stdlib');

// Step 1: Remove nested botbuilder-stdlib to avoid module resolution conflicts
// Botbuilder will use the top-level botbuilder-stdlib instead
if (existsSync(nestedBotbuilderStdlib)) {
  console.log('🗑️  Removing nested botbuilder-stdlib to avoid conflicts...');
  try {
    rmSync(nestedBotbuilderStdlib, { recursive: true, force: true });
    console.log('✅ Removed nested botbuilder-stdlib');
  } catch (error) {
    console.error('❌ Failed to remove nested botbuilder-stdlib:', error.message);
  }
}

// Step 2: Ensure top-level botbuilder-stdlib has proper structure
if (existsSync(topLevelBotbuilderStdlib)) {
  console.log('\n🔧 Ensuring botbuilder-stdlib has proper structure...');

  // Check if lib/azureCoreHttpCompat/index.js exists
  const azureIndexPath = join(topLevelBotbuilderStdlib, 'lib/azureCoreHttpCompat/index.js');
  const azureCompatPath = join(topLevelBotbuilderStdlib, 'lib/azureCoreHttpCompat/compat.js');
  const azureIndexJsPath = join(topLevelBotbuilderStdlib, 'lib/azureCoreHttpCompat.js');

  // If azureCoreHttpCompat.js exists but index.js doesn't, create index.js
  if (existsSync(azureCompatPath) && !existsSync(azureIndexPath)) {
    console.log('📝 Creating index.js in azureCoreHttpCompat directory...');
    const indexContent = `// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Re-export everything from compat.js
const compat = require("./compat");
Object.keys(compat).forEach(function(key) {
  if (key !== "default" && !Object.prototype.hasOwnProperty.call(exports, key)) {
    Object.defineProperty(exports, key, {
      enumerable: true,
      get: function() { return compat[key]; }
    });
  }
});
`;
    writeFileSync(azureIndexPath, indexContent, 'utf8');
    console.log('✅ Created index.js in azureCoreHttpCompat');
  }

  // Remove the .js file if directory exists - Node.js will use directory/index.js
  // But keep .js as backup if directory doesn't have all files
  const azureDir = join(topLevelBotbuilderStdlib, 'lib/azureCoreHttpCompat');
  if (existsSync(azureDir) && existsSync(azureIndexJsPath)) {
    // Check if directory has all the files that .js re-exports
    const compatPath = join(azureDir, 'compat.js');
    const servicePath = join(azureDir, 'serviceClientContext.js');
    if (existsSync(compatPath) && existsSync(servicePath)) {
      console.log('⚠️  Both .js file and directory exist - directory will be used by Node.js');
    }
  }
}

// Step 3: Update botbuilder-stdlib package.json to remove exports field
const pkgJsonPath = join(topLevelBotbuilderStdlib, 'package.json');
if (existsSync(pkgJsonPath)) {
  console.log('\n🔧 Updating botbuilder-stdlib package.json...');
  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));

  // Remove exports field to use main field instead
  if (pkgJson.exports) {
    delete pkgJson.exports;
    writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2), 'utf8');
    console.log('✅ Removed exports field from botbuilder-stdlib');
  }
}

// Step 4: Also fix nested botframework-connector if it has issues
const nestedBotframework = join(packagedNodeModules, 'botframework-connector/node_modules');
if (existsSync(nestedBotframework)) {
  const nestedModules = readdirSync(nestedBotframework);
  if (nestedModules.length === 0) {
    try {
      rmSync(nestedBotframework, { recursive: true, force: true });
      console.log('🗑️  Removed empty botframework-connector/node_modules');
    } catch (error) {
      // Ignore
    }
  }
}

// Step 5: Check for and fix pino-std-serializers issues
const pinoStdSerializers = join(packagedNodeModules, 'pino-std-serializers');
const pinoNodeModules = join(packagedNodeModules, 'pino/node_modules');

if (existsSync(pinoStdSerializers)) {
  console.log('\n🔧 Checking pino-std-serializers...');

  // Ensure pino can find pino-std-serializers at top level
  // If pino has nested node_modules that conflict, remove them
  if (existsSync(pinoNodeModules)) {
    const nestedPinoModules = readdirSync(pinoNodeModules);
    if (nestedPinoModules.length === 0) {
      try {
        rmSync(pinoNodeModules, { recursive: true, force: true });
        console.log('🗑️  Removed empty pino/node_modules');
      } catch (error) {
        // Ignore
      }
    }
  }
}

// Step 6: Remove any empty nested node_modules directories
console.log('\n🧹 Cleaning up empty nested node_modules...');
function cleanEmptyDirs(dir) {
  if (!existsSync(dir)) return;

  const items = readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    if (item.isDirectory() && item.name === 'node_modules') {
      const subDir = join(dir, item.name);
      const subItems = readdirSync(subDir);
      if (subItems.length === 0) {
        try {
          rmSync(subDir, { recursive: true, force: true });
          console.log(`🗑️  Removed empty ${item.name} in ${dir}`);
        } catch (error) {
          // Ignore
        }
      }
    }
  }
}

// Clean top-level node_modules
const topLevelModules = readdirSync(packagedNodeModules);
for (const mod of topLevelModules) {
  const modPath = join(packagedNodeModules, mod);
  if (mod.startsWith('@')) {
    // Scoped packages
    const scopes = readdirSync(modPath);
    for (const scope of scopes) {
      cleanEmptyDirs(join(modPath, scope, 'node_modules'));
    }
  } else if (mod !== 'pino' && mod !== 'botbuilder' && mod !== 'botbuilder-stdlib') {
    cleanEmptyDirs(join(modPath, 'node_modules'));
  }
}

console.log('\n✅ Module fixes applied!');