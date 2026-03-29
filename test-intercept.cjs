/* global console */
const path = require('path');
const url = 'file:///C:/Users/Test/AppData/Local/Temp/index-fixed.html/_next/static/chunks/webpack-xxx.js';

const parsedUrl = new URL(url);
let resourcePath = parsedUrl.pathname;
console.log('pathname:', resourcePath);

if (resourcePath.includes('index-fixed.html')) {
  resourcePath = resourcePath.substring(resourcePath.indexOf('/_next/'));
}
console.log('after index-fixed handling:', resourcePath);

const nextStaticMatch = resourcePath.match(/\/_next\/static\/(.+)$/);
console.log('static match:', nextStaticMatch?.[1]);

if (nextStaticMatch) {
  const appPath = 'C:/Users/Test/AppData/Local/Temp';
  const filePath = path.join(appPath, 'next', '.next', 'static', nextStaticMatch[1]);
  console.log('filePath:', filePath);
  const normalized = filePath.replace(/\\/g, '/');
  console.log('normalized:', normalized);
}
