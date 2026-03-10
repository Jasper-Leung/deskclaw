# Troubleshooting Guide

This guide helps you resolve common issues with DeskClaw.

## Table of Contents

- [Installation Issues](#installation-issues)
- [Development Issues](#development-issues)
- [Build Issues](#build-issues)
- [Runtime Issues](#runtime-issues)
- [Performance Issues](#performance-issues)

## Installation Issues

### Dependencies fail to install

**Problem**: `npm install` fails with errors

**Solutions**:

1. Clear npm cache:

   ```bash
   npm cache clean --force
   ```

2. Delete node_modules and package-lock.json:

   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

3. Try using a different Node version:
   ```bash
   nvm use 20  # or 18
   ```

### Native module compilation fails

**Problem**: `better-sqlite3` or other native modules fail to compile

**Solutions**:

1. Install build tools:
   - **Windows**: Install Visual Studio Build Tools
   - **macOS**: Install Xcode Command Line Tools
   - **Linux**: Install build-essential

2. Rebuild native modules:
   ```bash
   npm rebuild
   ```

## Development Issues

### Dev server won't start

**Problem**: `npm run dev` fails to start

**Solutions**:

1. Check if port 3000 is available:

   ```bash
   # macOS/Linux
   lsof -i :3000
   # Windows
   netstat -ano | findstr :3000
   ```

2. Kill process using the port or change port in `.env`:

   ```
   NEXT_PORT=3001
   ```

3. Clear Next.js cache:
   ```bash
   rm -rf next/.next
   ```

### Hot reload not working

**Problem**: Changes don't reflect in the app

**Solutions**:

1. Restart dev server
2. Clear browser cache
3. Check for TypeScript errors

### Electron window doesn't load

**Problem**: Electron opens but shows blank screen

**Solutions**:

1. Check Next.js is running on expected port
2. Check console for errors:
   - Main process: Check terminal
   - Renderer: Open DevTools (F12)

3. Verify build-electron.js ran successfully

## Build Issues

### Build fails with TypeScript errors

**Problem**: Type errors during build

**Solutions**:

1. Run type check to see all errors:

   ```bash
   npm run typecheck
   ```

2. Fix type errors or use `// @ts-ignore` (as last resort)

3. Update shared types if needed

### Electron build fails

**Problem**: `electron-builder` fails to create distributable

**Solutions**:

1. Check build configuration in package.json
2. Ensure all assets exist:
   - `next/public/icon.ico` (Windows)
   - `next/public/icon.icns` (macOS)
   - `next/public/icon.png` (Linux)

3. Try building for single platform first

## Runtime Issues

### "Failed to decrypt API key" error

**Problem**: App shows error about API key decryption

**Solutions**:

1. Delete and re-add the provider
2. This can happen after app updates
3. Check encryption key in `.env`

### Database errors

**Problem**: App shows database-related errors

**Solutions**:

1. Check database file permissions
2. Database location: `~/AppData/Roaming/DeskClaw/data/deskclaw.db` (Windows)
3. Backup and delete database if corrupted:
   ```bash
   # Database will be recreated on next run
   mv deskclaw.db deskclaw.db.backup
   ```

### Channels not connecting

**Problem**: Integration channels fail to connect

**Solutions**:

1. Verify credentials are correct
2. Check network connectivity
3. Review channel-specific logs
4. Some channels require webhooks/public URLs

### Workflows not executing

**Problem**: Workflows fail to run

**Solutions**:

1. Check workflow has valid nodes and connections
2. Verify agent/model is configured
3. Check for missing required inputs
4. Review workflow execution logs

## Performance Issues

### App is slow to start

**Problem**: Long startup time

**Solutions**:

1. Reduce number of scheduled tasks
2. Disable unused channels
3. Clear old conversations
4. Check system resources

### High memory usage

**Problem**: App uses excessive memory

**Solutions**:

1. Restart app periodically
2. Clear memory vault of old entries
3. Reduce chat history size
4. Check for memory leaks in custom skills

### UI is laggy

**Problem**: Interface responds slowly

**Solutions**:

1. Close unused workflows
2. Clear browser cache (in renderer)
3. Disable animations if needed
4. Check for large lists (use virtual scrolling)

## Getting Help

If none of these solutions work:

1. **Check existing issues**: Look for similar problems in GitHub Issues
2. **Create an issue**: Include:
   - Operating system and version
   - Node.js version (`node --version`)
   - Steps to reproduce
   - Error messages or logs
   - Screenshots if applicable

3. **Enable debug logging**:
   ```
   LOG_LEVEL=debug
   ```

## Diagnostic Information

To gather diagnostic info:

```bash
# System info
node --version
npm --version
electron --version

# Project info
npm list --depth=0

# Build info
npm run build 2>&1 | tee build.log
```

Include this information when reporting issues.
