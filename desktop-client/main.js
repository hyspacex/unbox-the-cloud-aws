const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");

let widgetWindow = null;
let webInterfaceWindow = null;

function createWidgetWindow() {
  widgetWindow = new BrowserWindow({
    width: 252,
    height: 168,
    minWidth: 224,
    minHeight: 120,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    hasShadow: false,
    titleBarStyle: "hidden",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  widgetWindow.loadFile(path.join(__dirname, "widget.html"));
}

function openOrFocusWebInterface(query = "") {
  const targetFile = path.join(__dirname, "..", "demo", "index.html");
  if (webInterfaceWindow && !webInterfaceWindow.isDestroyed()) {
    webInterfaceWindow.loadFile(targetFile, { search: query });
    webInterfaceWindow.focus();
    return;
  }

  webInterfaceWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    title: "Keel / EpistemicBox — Detailed Compliance Web Interface",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  webInterfaceWindow.loadFile(targetFile, { search: query });
}

app.whenReady().then(() => {
  createWidgetWindow();

  ipcMain.on("open-web-interface", (_event, payload) => {
    const query = payload && payload.filter ? `?filter=${encodeURIComponent(payload.filter)}&snapshot=${encodeURIComponent(payload.snapshot || "S4")}&control=${encodeURIComponent(payload.controlId || "")}` : "";
    openOrFocusWebInterface(query);
  });

  ipcMain.on("broadcast-topic-event", (_event, msg) => {
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send("topic-event", msg);
      }
    });
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWidgetWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
