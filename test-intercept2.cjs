const fs = require('fs');
const path = require('path');

const appPath = 'D:/code/20260305/miniclaw7/release/win-unpacked/resources/app';

// Simulate what happens when Electron loads file:///C:/Users/.../deskclaw/index.html
// and the browser requests _next/static/chunks/webpack-xxx.js

// The actual URL would be something like:
// file:///C:/Users/Sewaken/AppData/Local/Temp/deskclaw/index.html
// Then the relative path _next/static/chunks/webpack-xxx.js becomes:
// file:///C:/Users/Sewaken/AppData/Local/Temp/deskclaw/_next/static/chunks/webpack-xxx.js

const testUrls = [
  'file:///C:/Users/Sewaken/AppData/Local/Temp/deskclaw/_next/static/chunks/webpack-4ad2bd6019f73577.js',
  'file:///C:/Users/Sewaken/AppData/Local/Temp/deskclaw/_next/static/css/d223f61888fa7e7e.css',
  'file:///C:/Users/Sewaken/AppData/Local/Temp/deskclaw/_next/static/chunks/c7879cf7-9458ccb5b50d2054.js',
];

for (const url of testUrls) {
  console.log('\n=== Testing URL:', url, '===');

  const parsedUrl = new URL(url);
  const pathname = decodeURIComponent(parsedUrl.pathname);
  console.log('pathname:', pathname);

  const nextIndex = pathname.indexOf('/_next/');
  console.log('nextIndex:', nextIndex);

  if (nextIndex === -1) {
    console.log('NO MATCH - would pass through');
    continue;
  }

  const nextPath = pathname.substring(nextIndex + 1);
  console.log('nextPath:', nextPath);

  let filePath;
  if (nextPath.startsWith('_next/static/')) {
    const resourceRelPath = nextPath.substring('_next/static/'.length);
    filePath = path.join(appPath, 'next', '.next', 'static', resourceRelPath);
  } else {
    console.log('NOT static/server - would pass through');
    continue;
  }

  console.log('filePath:', filePath);
  console.log('file exists:', fs.existsSync(filePath));

  const fileUrl = 'file:///' + filePath.replace(/\\/g, '/');
  console.log('redirectURL:', fileUrl);
}
