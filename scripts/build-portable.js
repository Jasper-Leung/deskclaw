#!/usr/bin/env node

/* eslint-disable no-undef */
/**
 * Build Portable Version Script
 *
 * This script builds a portable version of DeskClaw that doesn't require installation.
 * The portable version will be created in the release/ directory.
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 Building DeskClaw Portable Version...\n');

// Ensure release directory exists
const releaseDir = join(__dirname, '../release');
if (!existsSync(releaseDir)) {
  mkdirSync(releaseDir, { recursive: true });
  console.log('✅ Created release directory');
}

try {
  // Step 1: Clean previous builds
  console.log('🧹 Cleaning previous builds...');
  try {
    execSync('npx rimraf release dist-electron next/.next', {
      cwd: join(__dirname, '..'),
      stdio: 'inherit',
    });
  } catch {
    // Ignore errors if directories don't exist
  }

  // Step 2: Build electron
  console.log('\n📦 Building Electron main process...');
  execSync('node build-electron.js', {
    cwd: join(__dirname, '..'),
    stdio: 'inherit',
  });

  // Step 3: Build Next.js
  console.log('\n🔨 Building Next.js frontend...');
  execSync('npx rimraf next/.next && cd next && npx next build', {
    cwd: join(__dirname, '..'),
    stdio: 'inherit',
  });

  // Step 4: Build portable executable
  console.log('\n💿 Building portable executable...');
  execSync('npx electron-builder --win --x64 --publish never', {
    cwd: join(__dirname, '..'),
    stdio: 'inherit',
  });

  console.log('\n✅ Build complete!');
  console.log('\n📁 Portable executable location:');
  console.log(`   ${join(__dirname, '../release/DeskClaw-*-portable.exe')}\n`);
  console.log('💡 You can now run the portable version without installation.\n');
} catch (error) {
  console.error('\n❌ Build failed:', error.message);
  process.exit(1);
}
