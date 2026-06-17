import { app, BrowserWindow, ipcMain, screen } from "electron";
import * as path from "path";

const isDev = process.env.NODE_ENV === "development";

// Transparent Electron windows render as a solid BLACK box on Wayland when GPU-composited.
// Forcing software compositing (as hyprvox's overlay does) makes transparency work and avoids
// the most common Wayland overlay crashes. Must be set before app is ready.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-software-rasterizer");
app.commandLine.appendSwitch("disable-dev-shm-usage");

process.on("uncaughtException", (err) => console.error("[overlay] uncaught:", err));
process.on("unhandledRejection", (reason) => console.error("[overlay] unhandled:", reason));

const WIDGET_W = 272;
const WIDGET_H_BASE = 134;
const WIDGET_H_BUBBLE = 300;

let win: BrowserWindow | null = null;

function createWindow() {
  const { width } = screen.getPrimaryDisplay().workAreaSize;

  win = new BrowserWindow({
    width: WIDGET_W,
    height: WIDGET_H_BASE,
    // top-right corner
    x: width - WIDGET_W - 20,
    y: 20,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Keep it pinned across workspaces and above other windows (matches hyprvox's overlay).
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setAlwaysOnTop(true, "floating");

  if (isDev) {
    win.loadURL("http://localhost:5173");
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  win.webContents.on("did-fail-load", (_e, code, desc, url) =>
    console.error(`[overlay] renderer failed to load: ${code} ${desc} (${url})`),
  );

  ipcMain.on("move-window", (_e, { deltaX, deltaY }: { deltaX: number; deltaY: number }) => {
    if (!win) return;
    const [x, y] = win.getPosition();
    win.setPosition(x + deltaX, y + deltaY);
  });

  ipcMain.on("set-bubble", (_e, { show }: { show: boolean }) => {
    if (!win) return;
    const [x, y] = win.getPosition();
    win.setBounds({ x, y, width: WIDGET_W, height: show ? WIDGET_H_BUBBLE : WIDGET_H_BASE }, true);
  });

  ipcMain.handle("toggle-pin", () => {
    if (!win) return false;
    const next = !win.isAlwaysOnTop();
    win.setAlwaysOnTop(next);
    return next;
  });

  ipcMain.on("close-overlay", () => win?.hide());
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
