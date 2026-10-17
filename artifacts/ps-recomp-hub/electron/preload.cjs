const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("recompHub", {
  isDesktop: true,
  chooseInput: (generation) => ipcRenderer.invoke("hub:choose-input", generation),
  chooseFolder: (purpose) => ipcRenderer.invoke("hub:choose-folder", purpose),
  configurePs5Tool: () => ipcRenderer.invoke("hub:configure-ps5-tool"),
  getToolStatus: () => ipcRenderer.invoke("hub:get-tool-status"),
  runPs5Relinker: (input) => ipcRenderer.invoke("hub:run-ps5-relinker", input),
  cancelRun: () => ipcRenderer.invoke("hub:cancel-run"),
  onToolOutput: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("hub:tool-output", listener);
    return () => ipcRenderer.removeListener("hub:tool-output", listener);
  },
});
