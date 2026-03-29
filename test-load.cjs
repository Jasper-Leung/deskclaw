const fs = require('fs');
const path = require('path');

const appPath = 'D:/code/20260305/miniclaw7/release/win-unpacked/resources/app';
const indexHtmlPath = path.join(appPath, 'next', '.next', 'server', 'app', 'index.html');

console.log('HTML exists:', fs.existsSync(indexHtmlPath));
console.log('HTML size:', fs.statSync(indexHtmlPath).size);

let htmlContent = fs.readFileSync(indexHtmlPath, 'utf8');
console.log('\n=== Before replacement (first 500 chars) ===');
console.log(htmlContent.substring(0, 500));

htmlContent = htmlContent.replace(/(href|src)="\/_next\//g, '$1="_next/');
htmlContent = htmlContent.replace(/="\/_next\//g, '="_next/');

console.log('\n=== After replacement (first 500 chars) ===');
console.log(htmlContent.substring(0, 500));

// Check script tags
const scriptMatches = htmlContent.match(/<script[^>]*>/g);
console.log('\n=== Script tags ===');
scriptMatches?.forEach((m, i) => console.log(i, m));

// Check link tags
const linkMatches = htmlContent.match(/<link[^>]*>/g);
console.log('\n=== Link tags ===');
linkMatches?.forEach((m, i) => console.log(i, m));

// Check if _next files exist
const jsFiles = htmlContent.match(/src="([^"]+)"/g);
if (jsFiles) {
  console.log('\n=== JS file references ===');
  jsFiles.forEach((m) => {
    const src = m.match(/src="([^"]+)"/)?.[1];
    if (src && src.includes('_next')) {
      const filePath = path.join(appPath, 'next', '.next', 'static', src.replace('_next/static/', ''));
      console.log(src, '-> exists:', fs.existsSync(filePath));
    }
  });
}
