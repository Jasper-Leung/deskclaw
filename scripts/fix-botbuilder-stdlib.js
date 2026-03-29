#!/usr/bin/env node
/* eslint-disable no-console */
/* global process */

/**
 * Fix for botbuilder-stdlib/lib/azureCoreHttpCompat missing index.js
 * This is needed because botbuilder@4.23.3 imports from 'botbuilder-stdlib/lib/azureCoreHttpCompat'
 * but package only has compat.js in that directory, not index.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const indexContent = `// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// Auto-generated fix for missing index.js in azureCoreHttpCompat directory
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

function fixBotbuilderStdlib(targetDir, description) {
  const indexPath = path.join(targetDir, 'index.js');

  try {
    if (!fs.existsSync(targetDir)) {
      console.log(`⚠️  ${description} not found, skipping`);
      return false;
    }

    // Create index.js if it doesn't exist
    if (!fs.existsSync(indexPath)) {
      fs.writeFileSync(indexPath, indexContent, 'utf8');
      console.log(`✅ Fixed ${description}`);
      return true;
    } else {
      console.log(`✅ ${description} already applied`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Failed to fix ${description}:`, error.message);
    return false;
  }
}

// Fix main botbuilder-stdlib
const mainTargetDir = path.join(
  __dirname,
  '../node_modules/botbuilder-stdlib/lib/azureCoreHttpCompat'
);
fixBotbuilderStdlib(mainTargetDir, 'botbuilder-stdlib/lib/azureCoreHttpCompat/index.js');

// Also check for nested botbuilder-stdlib (when botbuilder includes it as a dependency)
const nestedTargetDir = path.join(
  __dirname,
  '../node_modules/botbuilder/node_modules/botbuilder-stdlib/lib/azureCoreHttpCompat'
);
fixBotbuilderStdlib(
  nestedTargetDir,
  'botbuilder/node_modules/botbuilder-stdlib/lib/azureCoreHttpCompat/index.js'
);

// NEW: Create a top-level botbuilder-stdlib directory if it doesn't exist
// This is needed because botbuilder imports from the top level
const topLevelStdlibDir = path.join(__dirname, '../node_modules/botbuilder-stdlib');
const nestedStdlibDir = path.join(
  __dirname,
  '../node_modules/botbuilder/node_modules/botbuilder-stdlib'
);

if (fs.existsSync(nestedStdlibDir) && !fs.existsSync(topLevelStdlibDir)) {
  console.log('📋 Creating top-level botbuilder-stdlib symlink...');
  try {
    // On Windows, use junction; on Unix, use symlink
    if (process.platform === 'win32') {
      execSync(`mklink /J "${topLevelStdlibDir}" "${nestedStdlibDir}"`, {
        shell: true,
        windowsHide: true,
      });
    } else {
      fs.symlinkSync(nestedStdlibDir, topLevelStdlibDir, 'junction');
    }
    console.log('✅ Created junction for botbuilder-stdlib');
  } catch (error) {
    console.log('⚠️  Symlink failed, copying directory instead...');
    // Fall back to copying
    try {
      execSync(`xcopy "${nestedStdlibDir}" "${topLevelStdlibDir}" /E /I /H /Y`, {
        shell: true,
        windowsHide: true,
      });
      console.log('✅ Copied botbuilder-stdlib to top level');
    } catch (copyError) {
      console.error('❌ Failed to copy botbuilder-stdlib:', copyError.message);
    }
  }
} else if (fs.existsSync(topLevelStdlibDir)) {
  console.log('✅ Top-level botbuilder-stdlib already exists');
}
