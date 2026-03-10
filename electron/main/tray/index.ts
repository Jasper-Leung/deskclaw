import { Tray, Menu, BrowserWindow, app, Notification, nativeImage } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let tray: Tray | null = null;
let pendingApprovals = 0;

export const createTray = (mainWindow: BrowserWindow | null): void => {
  if (tray) {
    return; // Tray already created
  }

  // Try to create tray - this is optional on some platforms
  try {
    // Use process.cwd() to get the project root and find the icon
    // Use .ico on Windows, .png on other platforms
    const iconExt = process.platform === 'win32' ? 'ico' : 'png';
    const iconPath = path.join(process.cwd(), 'next', 'public', `icon.${iconExt}`);

    // Check if file exists before trying to load it
    if (existsSync(iconPath)) {
      tray = new Tray(iconPath);
    } else {
      // Create a simple 16x16 empty icon as fallback
      const emptyIcon = nativeImage.createEmpty();
      tray = new Tray(emptyIcon);
    }
  } catch (error) {
    // Tray icon is optional - log warning but don't fail
    console.warn('Tray icon not available:', (error as Error).message);
    tray = null; // Ensure tray is null so we can try again later
    return;
  }

  // Only proceed if tray was successfully created
  if (!tray) {
    return;
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show DeskClaw',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          // Create new window if it doesn't exist
          app.emit('activate');
        }
      },
    },
    {
      label: 'Quick Chat',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send('navigate', '/chat');
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit DeskClaw',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setToolTip('DeskClaw - AI Agent Desktop');
  tray.setContextMenu(contextMenu);

  // Show window when tray icon is clicked (double-click on Windows)
  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
};

export const destroyTray = (): void => {
  if (tray) {
    tray.destroy();
    tray = null;
  }
};

/**
 * Show a notification for approval request
 */
export const showApprovalNotification = (
  approvalId: string,
  command: string,
  isDangerous: boolean
): void => {
  pendingApprovals++;
  updateTrayForApproval();

  const notification = new Notification({
    title: isDangerous ? '🚨 Dangerous Command Approval' : '⚠️ Command Approval Required',
    body: `Command requires approval: ${command.slice(0, 50)}${command.length > 50 ? '...' : ''}`,
    urgency: isDangerous ? 'critical' : 'normal',
  });

  notification.on('click', () => {
    // Show window and navigate to approval
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      windows[0].show();
      windows[0].focus();
      // Send IPC event to show approval dialog
      windows[0].webContents.send('show-approval-dialog', { approvalId, command, isDangerous });
    }
  });

  notification.show();
};

/**
 * Mark an approval as completed and update tray
 */
export const clearApproval = (): void => {
  if (pendingApprovals > 0) {
    pendingApprovals--;
    if (pendingApprovals === 0) {
      updateTrayForApproval();
    }
  }
};

/**
 * Update tray appearance when there are pending approvals
 */
const updateTrayForApproval = (): void => {
  if (!tray) return;

  if (pendingApprovals > 0) {
    tray.setToolTip(`MiniClaw - ${pendingApprovals} pending approval(s)`);
    // Could change image here if you have different icons
  } else {
    tray.setToolTip('DeskClaw - AI Agent Desktop');
  }
};
