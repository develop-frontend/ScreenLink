const {
    app,
    BrowserWindow,
    ipcMain,
    desktopCapturer,
    session
} = require("electron");

const path = require("path");
const WebSocket = require("ws");
const dgram = require("dgram");
const os = require("os");

const isReceiver =
    process.env.SCREENLINK_ROLE === "receiver";

let mainWindow;
let discoveredServer = null;
let selectedSourceId = null;
let broadcastServer = null;

let sender = null;
let receiver = null;


// ==========================================
// LOCAL IP
// ==========================================

function getLocalIp() {

    const nets = os.networkInterfaces();

    for (const name of Object.keys(nets)) {

        for (const net of nets[name]) {

            if (
                net.family === "IPv4" &&
                !net.internal
            ) {

                return net.address;

            }

        }

    }

    return "127.0.0.1";

}


// ==========================================
// WINDOW
// ==========================================

function createWindow(page = "sender.html") {

    mainWindow = new BrowserWindow({

        width: 1200,
        height: 800,

        webPreferences: {

            preload: path.join(__dirname, "preload.js"),

            contextIsolation: true,

            nodeIntegration: false

        }

    });

    mainWindow.loadFile(
        path.join(__dirname, "renderer", page)
    );

}


// ==========================================
// ELECTRON READY
// ==========================================

app.whenReady().then(() => {

    const page = isReceiver
        ? "receiver.html"
        : "sender.html";

    createWindow(page);


    // ======================================
    // DISPLAY MEDIA HANDLER
    // ======================================

    session.defaultSession.setDisplayMediaRequestHandler(

        async (request, callback) => {

            console.log("Display media requested");

            const sources =
                await desktopCapturer.getSources({

                    types: ["window", "screen"]

                });

            const source = sources.find(
                source =>
                    source.id === selectedSourceId
            );

            if (!source) {

                console.log(
                    "Selected source not found"
                );

                callback({});

                return;

            }

            console.log(
                "Granting source:",
                source.name
            );

            callback({

                video: source

            });

        },

        {
            useSystemPicker: false
        }

    );


    // ======================================
    // GET SOURCES
    // ======================================

    ipcMain.handle(
        "get-sources",
        async () => {

            console.log(
                "GET-SOURCES CALLED"
            );

            const sources =
                await desktopCapturer.getSources({

                    types: [
                        "window",
                        "screen"
                    ],

                    thumbnailSize: {

                        width: 320,
                        height: 180

                    }

                });

            return sources.map(source => ({

                id: source.id,

                name: source.name

            }));

        }
    );


    // ======================================
    // GET SERVER
    // ======================================

    ipcMain.handle(
        "get-server",
        () => {

            return discoveredServer;

        }
    );

    ipcMain.handle("is-receiver", () => {

        return isReceiver;

    });


    // ======================================
    // SELECT SOURCE
    // ======================================

    ipcMain.handle(
        "select-source",
        (event, sourceId) => {

            selectedSourceId =
                sourceId;

            console.log(
                "Selected source:",
                sourceId
            );

            return true;

        }
    );


    // ======================================
    // RECEIVER DISCOVERY
    // ======================================

    if (isReceiver) {

        const client =
            dgram.createSocket("udp4");

        client.bind(33333);

        client.on(
            "message",
            (msg) => {

                try {

                    const data =
                        JSON.parse(
                            msg.toString()
                        );

                    if (
                        data.app ===
                        "ScreenLink"
                    ) {

                        discoveredServer =
                            data;

                        console.log(
                            "Sender found:",
                            data.ip
                        );

                        client.close();

                    }

                } catch {}

            }
        );

    }

});


// ==========================================
// WEBSOCKET SERVER
// ==========================================

// const isReceiver =
//     process.argv.includes("--receiver");

if (!isReceiver) {

    const wss =
        new WebSocket.Server({

            port: 3000

        });

    console.log(
        "Embedded WebSocket started"
    );


    // ======================================
    // UDP BROADCAST
    // ======================================

    broadcastServer =
        dgram.createSocket("udp4");

    broadcastServer.bind(() => {

        broadcastServer.setBroadcast(
            true
        );

        setInterval(() => {

            const message =
                Buffer.from(

                    JSON.stringify({

                        app: "ScreenLink",

                        ip: getLocalIp(),

                        port: 3000

                    })

                );

            broadcastServer.send(

                message,

                33333,

                "255.255.255.255"

            );

        }, 2000);

    });


    // ======================================
    // WEBSOCKET CONNECTION
    // ======================================

    wss.on(
        "connection",
        (ws) => {

            console.log(
                "Client connected"
            );


            ws.on(
                "message",
                (message) => {

                    let data;

                    try {

                        data =
                            JSON.parse(
                                message
                            );

                    } catch {

                        return;

                    }

                    const {
                        type,
                        payload
                    } = data;


                    switch (type) {


                        // ==================
                        // JOIN
                        // ==================

                        case "join":

                            if (!sender) {

                                sender = ws;

                                ws.role =
                                    "sender";

                                console.log(
                                    "Sender joined"
                                );

                            } else {

                                receiver = ws;

                                ws.role =
                                    "receiver";

                                console.log(
                                    "Receiver joined"
                                );


                                if (
                                    sender &&
                                    sender.readyState ===
                                    WebSocket.OPEN
                                ) {

                                    sender.send(

                                        JSON.stringify({

                                            type:
                                                "receiver-connected"

                                        })

                                    );

                                }

                            }

                            break;


                        // ==================
                        // OFFER
                        // ==================

                        case "offer":

                            if (
                                receiver &&
                                receiver.readyState ===
                                WebSocket.OPEN
                            ) {

                                receiver.send(

                                    JSON.stringify({

                                        type:
                                            "offer",

                                        payload

                                    })

                                );

                            }

                            break;


                        // ==================
                        // ANSWER
                        // ==================

                        case "answer":

                            if (
                                sender &&
                                sender.readyState ===
                                WebSocket.OPEN
                            ) {

                                sender.send(

                                    JSON.stringify({

                                        type:
                                            "answer",

                                        payload

                                    })

                                );

                            }

                            break;


                        // ==================
                        // ICE
                        // ==================

                        case "ice-candidate":

                            if (
                                ws.role ===
                                "sender" &&
                                receiver &&
                                receiver.readyState ===
                                WebSocket.OPEN
                            ) {

                                receiver.send(

                                    JSON.stringify({

                                        type:
                                            "ice-candidate",

                                        payload

                                    })

                                );

                            }

                            else if (
                                ws.role ===
                                "receiver" &&
                                sender &&
                                sender.readyState ===
                                WebSocket.OPEN
                            ) {

                                sender.send(

                                    JSON.stringify({

                                        type:
                                            "ice-candidate",

                                        payload

                                    })

                                );

                            }

                            break;

                    }

                }
            );


            // ==============================
            // CLOSE
            // ==============================

            ws.on(
                "close",
                () => {

                    console.log(
                        "Client disconnected"
                    );


                    if (ws === sender) {

                        sender = null;

                    }


                    if (ws === receiver) {

                        receiver = null;

                    }

                }
            );

        }
    );

}


// ==========================================
// CLOSE APPLICATION
// ==========================================

app.on(
    "window-all-closed",
    () => {

        if (
            process.platform !==
            "darwin"
        ) {

            app.quit();

        }

    }
);