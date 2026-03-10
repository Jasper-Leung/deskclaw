import esbuild from 'esbuild';
import { globSync } from 'glob';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mainEntryPoints = globSync('electron/main/**/*.ts', {
  ignore: ['node_modules/**', 'dist-electron/**'],
});

const preloadEntryPoints = globSync('electron/preload/**/*.ts', {
  ignore: ['node_modules/**', 'dist-electron/**'],
});

const outdir = path.join(__dirname, 'dist-electron');

// Ensure outdir exists
if (!fs.existsSync(outdir)) {
  fs.mkdirSync(outdir, { recursive: true });
}

// Build main process (ESM)
await esbuild.build({
  entryPoints: mainEntryPoints,
  bundle: false,
  outdir,
  outbase: 'electron',
  platform: 'node',
  target: 'node18',
  format: 'esm',
  sourcemap: true,
  logLevel: 'info',
});

// Build preload script (CommonJS)
await esbuild.build({
  entryPoints: preloadEntryPoints,
  bundle: false,
  outdir,
  outbase: 'electron',
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  sourcemap: true,
  logLevel: 'info',
});

console.log('Electron build complete!');
