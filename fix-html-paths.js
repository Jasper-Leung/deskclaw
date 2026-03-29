import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nextBuildDir = path.join(__dirname, 'next', '.next', 'server', 'app');

function fixHTMLFiles(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      fixHTMLFiles(filePath);
    } else if (file.endsWith('.html')) {
      console.log('Fixing:', filePath);
      let content = fs.readFileSync(filePath, 'utf8');

      // Replace absolute paths with relative paths
      content = content.replace(/href="\/_next\//g, 'href="_next/');
      content = content.replace(/src="\/_next\//g, 'src="_next/');

      fs.writeFileSync(filePath, content);
    }
  }
}

console.log('Fixing HTML files in:', nextBuildDir);
fixHTMLFiles(nextBuildDir);
console.log('Done!');
