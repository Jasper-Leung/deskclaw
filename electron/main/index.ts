import { app, BrowserWindow, ipcMain, protocol } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { createTray } from './tray/index.js';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;

// MIME type map for serving static files
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json; charset=utf-8',
  '.rsc': 'text/x-component',
  '.wasm': 'application/wasm',
};

// Register custom protocol as privileged BEFORE app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      devTools: true,
    },
    show: true,
    autoHideMenuBar: true,
  });

  // Capture renderer errors for debugging
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDesc, validatedURL) => {
    console.error(`[MAIN] Page failed to load: ${errorCode} ${errorDesc} URL: ${validatedURL}`);
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      console.error(`[RENDERER] ${message} (${sourceId}:${line})`);
    }
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[MAIN] Renderer process gone: ${details.reason} ${details.exitCode}`);
  });

  // In development, load from Next.js dev server
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev) {
    const nextPort = process.env.NEXT_PORT || '3000';
    mainWindow.loadURL(`http://localhost:${nextPort}`);
    mainWindow.webContents.openDevTools();
  } else {
    // In production, use custom protocol app:// to serve files
    mainWindow.loadURL('app://localhost/');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

// Helper: read file and create Response with correct Content-Type
function serveFile(filePath: string): Response {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const content = fs.readFileSync(filePath);
  return new Response(content, {
    status: 200,
    headers: { 'Content-Type': contentType },
  });
}

// Register custom protocol handler for serving Next.js files
function registerProtocolHandler() {
  const appPath = app.getAppPath();
  const indexPath = path.join(appPath, 'next', '.next', 'server', 'app', 'index.html');

  protocol.handle('app', (request) => {
    try {
      const url = new URL(request.url);
      let pathname = decodeURIComponent(url.pathname);

      // Normalize: remove leading slash
      if (pathname.startsWith('/')) {
        pathname = pathname.substring(1);
      }

      let filePath: string;

      if (pathname === '' || pathname === '/' || pathname === 'index.html') {
        // Serve the main HTML page
        filePath = indexPath;
      } else if (pathname.startsWith('_next/static/')) {
        // Serve static assets (_next/static/...)
        filePath = path.join(
          appPath,
          'next',
          '.next',
          'static',
          pathname.substring('_next/static/'.length)
        );
      } else {
        // Try serving as a page route: /chat → chat.html
        // First try with .html extension
        const pagePath = path.join(appPath, 'next', '.next', 'server', 'app', pathname + '.html');
        if (fs.existsSync(pagePath)) {
          filePath = pagePath;
        } else {
          // Try serving from next/public/ (e.g. /icon.png, /favicon.ico)
          const publicPath = path.join(appPath, 'next', 'public', pathname);
          if (fs.existsSync(publicPath) && fs.statSync(publicPath).isFile()) {
            filePath = publicPath;
          } else {
            // Fallback to index.html for SPA client-side routing
            filePath = indexPath;
          }
        }
      }

      // Security: ensure the resolved path is within the app directory
      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(path.resolve(appPath))) {
        return new Response('Forbidden', { status: 403 });
      }

      if (!fs.existsSync(resolvedPath)) {
        // Final fallback to index.html
        if (fs.existsSync(indexPath)) {
          return serveFile(indexPath);
        }
        return new Response('Not Found', { status: 404 });
      }

      return serveFile(resolvedPath);
    } catch (error) {
      console.error('[PROTOCOL] Error handling request:', request.url, error);
      return new Response('Internal Server Error', { status: 500 });
    }
  });
}

// App lifecycle
app.whenReady().then(async () => {
  // Register custom protocol handler FIRST (before loading any URL)
  registerProtocolHandler();

  // Lazy-load heavy modules with error handling
  let registerIPCHandlers: typeof import('./ipc/index.js').registerIPCHandlers | null = null;
  let setMainWindowFn: typeof import('./ipc/index.js').setMainWindow | null = null;
  let getDatabase: typeof import('./db/index.js').getDatabase | null = null;
  let closeDatabase: typeof import('./db/index.js').closeDatabase | null = null;
  let scheduledHandlers: typeof import('./ipc/scheduled.js') | null = null;
  let getPredictiveEngine:
    | typeof import('./evolution/predictive-engine.js').getPredictiveEngine
    | null = null;
  let ipcLogger: typeof import('./lib/logger.js').ipcLogger | null = null;

  try {
    const loggerModule = await import('./lib/logger.js');
    ipcLogger = loggerModule.ipcLogger;
  } catch (error) {
    console.error('[STARTUP] Failed to load logger:', error);
  }

  try {
    const ipcModule = await import('./ipc/index.js');
    registerIPCHandlers = ipcModule.registerIPCHandlers;
    setMainWindowFn = ipcModule.setMainWindow;
  } catch (error) {
    console.error('[STARTUP] Failed to load IPC module:', error);
  }

  try {
    const dbModule = await import('./db/index.js');
    getDatabase = dbModule.getDatabase;
    closeDatabase = dbModule.closeDatabase;
  } catch (error) {
    console.error('[STARTUP] Failed to load database module:', error);
  }

  try {
    scheduledHandlers = await import('./ipc/scheduled.js');
  } catch (error) {
    console.error('[STARTUP] Failed to load scheduled handlers:', error);
  }

  try {
    const evolutionModule = await import('./evolution/predictive-engine.js');
    getPredictiveEngine = evolutionModule.getPredictiveEngine;
  } catch (error) {
    console.error('[STARTUP] Failed to load evolution module:', error);
  }

  // Run database migrations
  if (ipcLogger) {
    try {
      const { EvolutionMigration } = await import('./db/migration-evolution.js');
      const migration = new EvolutionMigration(EvolutionMigration.getDatabasePath());
      const migrationResult = migration.migrateUp();
      ipcLogger.info({ result: migrationResult }, 'Evolution migration result');
      migration.close();
    } catch (error) {
      ipcLogger.error(error as Error, 'Evolution migration failed');
    }
  }

  // Register IPC handlers
  if (registerIPCHandlers) {
    registerIPCHandlers();
  }

  // Initialize scheduled tasks
  if (getDatabase && scheduledHandlers) {
    try {
      const db = getDatabase();
      scheduledHandlers.initializeScheduledTasks(db);
    } catch (error) {
      console.error('[STARTUP] Failed to initialize scheduled tasks:', error);
    }
  }

  // Start evolution learning loop
  if (getPredictiveEngine && ipcLogger) {
    try {
      const predictiveEngine = getPredictiveEngine();
      startEvolutionLearningLoop(predictiveEngine, ipcLogger);
    } catch (error) {
      console.error('[STARTUP] Failed to start evolution learning loop:', error);
    }
  }

  // Create window
  createWindow();

  if (mainWindow && setMainWindowFn) {
    setMainWindowFn(mainWindow);
  }

  if (mainWindow && scheduledHandlers) {
    scheduledHandlers.setScheduledMainWindow(mainWindow);
  }

  // Create system tray
  try {
    createTray(mainWindow);
  } catch (error) {
    console.error('[STARTUP] Failed to create tray:', error);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Keep app running in background for tray
  }
});

app.on('before-quit', async () => {
  try {
    const dbModule = await import('./db/index.js');
    dbModule.closeDatabase();
  } catch {
    // Database may not be initialized
  }

  try {
    const m = await import('./ipc/community-keys.js');
    m.stopHeartbeatSystem();
  } catch {
    // Community keys module may not be initialized
  }

  try {
    const scheduledHandlers = await import('./ipc/scheduled.js');
    scheduledHandlers.stopAllScheduledTasks();
  } catch {
    // Scheduled handlers may not be initialized
  }
});

// IPC handlers for window control
ipcMain.on('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.on('window:close', () => {
  mainWindow?.close();
});

ipcMain.on('window:hide', () => {
  mainWindow?.hide();
});

ipcMain.on('window:show', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
});

// ============================================================================
// Evolution Learning Loop
// ============================================================================

function startEvolutionLearningLoop(
  predictiveEngine: ReturnType<
    typeof import('./evolution/predictive-engine.js').getPredictiveEngine
  >,
  ipcLogger: typeof import('./lib/logger.js').ipcLogger
): void {
  setTimeout(
    async () => {
      try {
        ipcLogger.info('Starting initial evolution learning cycle');
        await predictiveEngine.generatePredictedTasks();
        ipcLogger.info('Initial evolution learning cycle completed');
      } catch (error) {
        ipcLogger.error(error as Error, 'Failed to run initial learning cycle');
      }
    },
    5 * 60 * 1000
  );

  const LEARNING_INTERVAL = 60 * 60 * 1000;

  setInterval(async () => {
    try {
      ipcLogger.info('Starting periodic evolution learning cycle');
      const tasks = await predictiveEngine.generatePredictedTasks();
      ipcLogger.info(`Evolution learning completed: generated ${tasks.length} predictions`);
    } catch (error) {
      ipcLogger.error(error as Error, 'Failed to run periodic learning cycle');
    }
  }, LEARNING_INTERVAL);

  ipcLogger.info(
    `Evolution learning loop started (interval: ${LEARNING_INTERVAL / 1000 / 60} minutes)`
  );
}
