const { contextBridge, ipcRenderer } = require('electron');

// ۱. تعریف تمام توابع در یک شیء ثابت
const api = {
    runGrabCut: (data) => ipcRenderer.invoke('run-grabcut', data),
    executeFsOperation: (operation, ...args) => ipcRenderer.invoke('execute-fs-operation', operation, ...args),
    getStoreValue: (key) => ipcRenderer.invoke('execute-fs-operation', 'getStoreValue', key),
    setStoreValue: (key, value) => ipcRenderer.invoke('execute-fs-operation', 'setStoreValue', key, value),
    saveFile: (vtoType, fileName, filePath) => ipcRenderer.invoke('execute-fs-operation', 'saveFile', vtoType, fileName, filePath),
    deleteFile: (vtoType, fileName) => ipcRenderer.invoke('execute-fs-operation', 'deleteFile', vtoType, fileName),
    listFiles: (vtoType) => ipcRenderer.invoke('execute-fs-operation', 'listFiles', vtoType),
    
    py: { 
        render: (data) => ipcRenderer.invoke('vto-render', data) 
    },
    
    requestSubscriptionUpdate: () => ipcRenderer.invoke('request-subscription-update'),
    onSubscriptionStatus: (callback) => {
        ipcRenderer.on('subscription-status', (event, value) => callback(value));
    },
    
    clearAllData: () => ipcRenderer.invoke('execute-fs-operation', 'clearAllData'),
    onClearAllDataResponse: (callback) => {
        ipcRenderer.on('clear-all-data-response', (event, value) => callback(value));
    },

    getMachineId: () => ipcRenderer.invoke('get-machine-id'),
};

// ۲. تزریق اجباری به پنجره اصلی (بسیار مهم)
// این بخش تضمین می‌کند که window.electronAPI همیشه در دسترس app.js باشد
contextBridge.exposeInMainWorld('electronAPI', api);