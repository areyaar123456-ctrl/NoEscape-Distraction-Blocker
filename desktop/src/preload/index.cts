const { contextBridge, ipcRenderer } = require('electron');

console.log('[PRELOAD] Injecting Focus API into window...');

try {
    contextBridge.exposeInMainWorld('api', {
        startSession: (data: any) => ipcRenderer.invoke('session:start', data),
        endSession: () => ipcRenderer.invoke('session:end'),
        getStatus: () => ipcRenderer.invoke('session:status'),
        syncBlocklist: (data: any) => ipcRenderer.invoke('blocklist:sync', data),
        openExternal: (url: string) => ipcRenderer.invoke('shell:open', url),
        checkAdmin: () => ipcRenderer.invoke('sys:check-admin'),
        getRunningApps: (showAll?: boolean) => ipcRenderer.invoke('sys:get-running-apps', showAll),
        getFileIcon: (path: string) => ipcRenderer.invoke('sys:get-file-icon', path),
        // Local Data Store bindings
        getBlocklists: () => ipcRenderer.invoke('store:getBlocklists'),
        saveBlocklists: (lists: any[]) => ipcRenderer.invoke('store:saveBlocklists', lists),
        getHistory: () => ipcRenderer.invoke('store:getHistory'),
        saveHistory: (history: any[]) => ipcRenderer.invoke('store:saveHistory', history),
        triggerSplash: () => ipcRenderer.invoke('sys:trigger-splash'),
    });
    console.log('[PRELOAD] Successfully exposed window.api');
} catch (error) {
    console.error('[PRELOAD] Failed to expose api:', error);
}
