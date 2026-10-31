const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("recompHub", {
  isDesktop: true,
  chooseInput: (generation, language) => ipcRenderer.invoke("hub:choose-input", generation, language),
  validatePs1DiscSet: (paths) => ipcRenderer.invoke("hub:validate-ps1-disc-set", paths),
  chooseFolder: (purpose, language) => ipcRenderer.invoke("hub:choose-folder", purpose, language),
  runPs1Build: (input) => ipcRenderer.invoke("hub:run-ps1-build", input),
  installPs5Tools: () => ipcRenderer.invoke("hub:install-ps5-tools"),
  getToolStatus: () => ipcRenderer.invoke("hub:get-tool-status"),
  runPs5Relinker: (input) => ipcRenderer.invoke("hub:run-ps5-relinker", input),
  cancelRun: () => ipcRenderer.invoke("hub:cancel-run"),
  onToolOutput: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("hub:tool-output", listener);
    return () => ipcRenderer.removeListener("hub:tool-output", listener);
  },
  onToolProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("hub:tool-progress", listener);
    return () => ipcRenderer.removeListener("hub:tool-progress", listener);
  },
});
