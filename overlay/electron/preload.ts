import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  moveWindow: (deltaX: number, deltaY: number) =>
    ipcRenderer.send("move-window", { deltaX, deltaY }),
  setBubble: (show: boolean) =>
    ipcRenderer.send("set-bubble", { show }),
  togglePin: (): Promise<boolean> => ipcRenderer.invoke("toggle-pin"),
  closeOverlay: () => ipcRenderer.send("close-overlay"),
});
