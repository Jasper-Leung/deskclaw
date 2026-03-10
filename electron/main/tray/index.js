import { Tray, Menu, app } from 'electron';
import path from 'path';
let tray = null;
export const createTray = (mainWindow) => {
  if (tray) {
    return; // Tray already created
  }
  // Use a simple icon - in production, you'd use your actual icon file
  const iconPath = path.join(__dirname, '../../../next/public/icon.png');
  tray = new Tray(iconPath);
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
export const destroyTray = () => {
  if (tray) {
    tray.destroy();
    tray = null;
  }
};
