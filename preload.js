const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {

    getSources: () =>
        ipcRenderer.invoke("get-sources"),

    getServer: () =>
        ipcRenderer.invoke("get-server"),

    selectSource: (sourceId) =>
        ipcRenderer.invoke(
            "select-source",
            sourceId
        ),
    
    isReceiver: () =>
    ipcRenderer.invoke("is-receiver")    

});