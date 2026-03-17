# Building DeskClaw Portable Version

This guide explains how to build a portable version of DeskClaw that doesn't require installation.

## Quick Start

### Windows

Simply double-click the `build-portable.bat` file in the scripts directory, or run:

```bash
npm run build:portable:bat
```

### Cross-Platform

Run the Node.js script:

```bash
npm run build:portable
```

## What Gets Built

The build process creates a portable executable (.exe) that:

- **Doesn't require installation** - Just run the executable directly
- **Is self-contained** - Includes all dependencies
- **Can be run from any location** - USB drive, network share, etc.
- **Doesn't write to registry** - Clean removal by deleting the file

## Build Process

The build script performs these steps:

1. **Cleans previous builds** - Removes old build artifacts
2. **Builds Electron main process** - Compiles TypeScript to JavaScript
3. **Builds Next.js frontend** - Creates optimized production build
4. **Creates portable executable** - Packages everything into a single .exe

## Output

After successful build, you'll find:

```
release/
└── DeskClaw-0.1.0-portable.exe
```

## System Requirements

- **Node.js** 20.0.0 or higher
- **npm** (comes with Node.js)
- **Windows** (for .exe build)
- About **4GB** of free disk space
- About **8GB** of RAM recommended

## Troubleshooting

### Build fails with "Out of memory"

Try increasing Node.js memory limit:

```bash
npm run build:portable -- --max-old-space-size=8192
```

### Build fails with "Module not found"

Install dependencies:

```bash
npm install
```

### Portable executable doesn't run

- Check Windows Defender isn't blocking it
- Right-click > Properties > Unblock
- Try running as Administrator

## Advanced Options

### Build for directory (not packaged)

```bash
npm run build:portable:dir
```

This builds to a directory without creating the .exe, useful for debugging.

### Custom build configuration

Edit `package.json` > `build` section to customize:

- App name
- Icon
- Output directory
- Target platforms
