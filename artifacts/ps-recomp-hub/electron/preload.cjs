const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("recompHub", {
  isDesktop: true,
  chooseInput: (generation, language) => ipcRenderer.invoke("hub:choose-input", generation, language),
  validatePs1DiscSet: (paths) => ipcRenderer.invoke("hub:validate-ps1-disc-set", paths),
  chooseFolder: (purpose, language) => ipcRenderer.invoke("hub:choose-folder", purpose, language),
  configurePs5Tool: (language) => ipcRenderer.invoke("hub:configure-ps5-tool", language),
  installOfficialPs5Tool: () => ipcRenderer.invoke("hub:install-official-ps5-tool"),
  getToolStatus: () => ipcRenderer.invoke("hub:get-tool-status"),
  runPs5Relinker: (input) => ipcRenderer.invoke("hub:run-ps5-relinker", input),
  cancelRun: () => ipcRenderer.invoke("hub:cancel-run"),
  onPs5InstallProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("hub:ps5-install-progress", listener);
    return () => ipcRenderer.removeListener("hub:ps5-install-progress", listener);
  },
  onToolOutput: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("hub:tool-output", listener);
    return () => ipcRenderer.removeListener("hub:tool-output", listener);
  },
});
