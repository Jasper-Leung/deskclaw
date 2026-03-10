#!/usr/bin/env node
/**
 * Test script for keyboard/mouse control tools
 * This script safely tests the control functionality
 */

import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('🧪 Testing Keyboard/Mouse Control Tools\n');
console.log('='.repeat(50));

// Test 1: Get screen info (safe, no actual input)
console.log('\n📋 Test 1: Getting screen information...');
await runElectronScript(`
  (async () => {
    const { screenInfo } = await import('./dist-electron/main/tools/control.js');
    const result = await screenInfo.handler({});
    console.log('Screen Info Result:', JSON.stringify(result, null, 2));
  })()
`);

// Test 2: Screenshot (safe, just captures screen)
console.log('\n📸 Test 2: Taking a screenshot...');
await runElectronScript(`
  (async () => {
    const { screenshot } = await import('./dist-electron/main/tools/control.js');
    const result = await screenshot.handler({});
    if (result.error) {
      console.log('Screenshot Error:', result.error);
    } else {
      const { result: data } = result;
      console.log('Screenshot Success!');
      console.log('- Format:', data.mimeType);
      console.log('- Size:', data.size, 'bytes');
      console.log('- Base64 length:', data.data.length, 'chars');
      console.log('- Preview (first 100 chars of base64):', data.data.substring(0, 100) + '...');
    }
  })()
`);

// Test 3: Mouse position check (read-only, no movement)
console.log('\n🖱️ Test 3: Getting current mouse position...');
await runElectronScript(`
  (async () => {
    try {
      const nut = await import('nut.js');
      const point = await nut.mouse.getPosition();
      console.log('Current mouse position:');
      console.log('- X:', point.x);
      console.log('- Y:', point.y);
    } catch (error) {
      console.log('Error getting mouse position:', error.message);
    }
  })()
`);

console.log('\n' + '='.repeat(50));
console.log('✅ All safe tests completed!');
console.log('\n⚠️  Note: Mouse/keyboard action tests are skipped for safety.');
console.log('    These would be tested in the actual application with user permission.');

function runElectronScript(script) {
  return new Promise((resolve) => {
    const args = ['-e', script];
    const proc = spawn(process.execPath, args, {
      cwd: __dirname,
      stdio: ['inherit', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'development' }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
      process.stdout.write(data);
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
      process.stderr.write(data);
    });

    proc.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      proc.kill();
      resolve({ code: -1, stdout, stderr: 'Timeout' });
    }, 10000);
  });
}
