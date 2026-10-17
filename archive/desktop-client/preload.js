const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("keelDesktop", {
  platform: process.platform,
  openWebInterface: (payload) => ipcRenderer.send("open-web-interface", payload),
  publishTopicEvent: (msg) => ipcRenderer.send("broadcast-topic-event", msg),
  onTopicEvent: (callback) => {
    ipcRenderer.on("topic-event", (_event, msg) => callback(msg));
  },
  getPathForFile: (file) => {
    if (webUtils && typeof webUtils.getPathForFile === "function") {
      return webUtils.getPathForFile(file);
    }
    return file && file.path ? file.path : file.name;
  }
});
