import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerIPCHandlers, setMainWindow } from './ipc/index.js';
import { closeDatabase, getDatabase } from './db/index.js';
import { createTray } from './tray/index.js';
import * as scheduledHandlers from './ipc/scheduled.js';
import { getPredictiveEngine } from './evolution/predictive-engine.js';
import { ipcLogger } from './lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
    autoHideMenuBar: true,
  });

  setMainWindow(mainWindow);

  // Also set for scheduled tasks
  scheduledHandlers.setScheduledMainWindow(mainWindow);

  // In development, load from Next.js dev server
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev) {
    // Support dynamic port from environment variable (set by wait-for-next.mjs)
    const nextPort = process.env.NEXT_PORT || '3000';
    mainWindow.loadURL(`http://localhost:${nextPort}`);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../next/.next/server/app/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    setMainWindow(null);
  });
};

// App lifecycle
app.whenReady().then(async () => {
  // Run database migrations for evolution features
  try {
    const { EvolutionMigration } = await import('./db/migration-evolution.js');
    const migration = new EvolutionMigration(EvolutionMigration.getDatabasePath());
    const migrationResult = migration.migrateUp();
    ipcLogger.info({ result: migrationResult }, 'Evolution migration result');
    migration.close();
  } catch (error) {
    ipcLogger.error(error as Error, 'Evolution migration failed');
  }

  // Register IPC handlers
  registerIPCHandlers();

  // Initialize scheduled tasks
  const db = getDatabase();
  scheduledHandlers.initializeScheduledTasks(db);

  // Initialize predictive content engine
  const predictiveEngine = getPredictiveEngine();

  // Start evolution learning loop (runs every hour)
  startEvolutionLearningLoop(predictiveEngine);

  // Create window
  createWindow();

  // Create system tray
  createTray(mainWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Keep app running in background for tray
    // Don't quit, just hide windows
  }
});

app.on('before-quit', () => {
  // Cleanup
  scheduledHandlers.stopAllScheduledTasks();
  closeDatabase();
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

/**
 * Start the periodic evolution learning loop
 * Analyzes user behavior and generates predictions at regular intervals
 */
function startEvolutionLearningLoop(
  predictiveEngine: ReturnType<typeof getPredictiveEngine>
): void {
  // Initial learning after 5 minutes (don't slow down app startup)
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

  // Periodic re-learning every hour
  const LEARNING_INTERVAL = 60 * 60 * 1000; // 1 hour

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
