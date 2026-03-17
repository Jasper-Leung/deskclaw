/* eslint-disable no-undef */
/**
 * Start Chrome with Remote Debugging
 *
 * This script starts Chrome with remote debugging enabled on port 9222.
 */

import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';

// Chrome paths for different platforms
const CHROME_PATHS = {
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  ],
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ],
};

function findChromePath() {
  const paths = CHROME_PATHS[process.platform];
  if (!paths) {
    throw new Error(`Unsupported platform: ${process.platform}`);
  }

  for (const chromePath of paths) {
    if (fs.existsSync(chromePath)) {
      return chromePath;
    }
  }

  throw new Error('Chrome not found. Please install Chrome or update the paths in this script.');
}

function killChromeProcesses() {
  return new Promise((resolve) => {
    const command =
      process.platform === 'win32'
        ? 'taskkill /F /IM chrome.exe & taskkill /F /IM chrome-debug.exe'
        : 'pkill -f "chrome" || true';

    exec(command, () => {
      // Ignore errors if Chrome is not running
      resolve();
    });
  });
}

async function startChrome() {
  console.log('========================================');
  console.log('Starting Chrome with Remote Debugging');
  console.log('========================================\n');

  // Kill existing Chrome processes
  console.log('Closing all Chrome processes...');
  await killChromeProcesses();

  // Wait for processes to terminate
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Find Chrome path
  console.log('Finding Chrome installation...');
  const chromePath = findChromePath();
  console.log(`Found Chrome at: ${chromePath}\n`);

  // Start Chrome with remote debugging
  const userDataDir = process.platform === 'win32' ? '%TEMP%\\chrome-debug' : '/tmp/chrome-debug';
  const args = ['--remote-debugging-port=9222', `--user-data-dir=${userDataDir}`];

  // Add URL if provided
  const url = process.argv[2] || 'http://localhost:3001/';
  args.push(url);

  console.log('Starting Chrome with arguments:');
  console.log(`  ${args.join('\n  ')}\n`);

  const startCommand =
    process.platform === 'win32'
      ? `start "" "${chromePath}" ${args.map((a) => `"${a}"`).join(' ')}`
      : `"${chromePath}" ${args.join(' ')} > /dev/null 2>&1 &`;

  exec(startCommand, (error) => {
    if (error) {
      console.error('Failed to start Chrome:', error);
      process.exit(1);
    }

    console.log('✅ Chrome is starting with remote debugging enabled...\n');
    console.log('You can verify the connection by running:');
    console.log('  npm run chrome:check\n');
    console.log('Or wait a few seconds and then start the application.\n');
  });
}

startChrome().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
