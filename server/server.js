const WebSocket = require("ws");

const wss = new WebSocket.Server({
    port: 3000
});

let sender = null;
let receiver = null;

console.log("WebSocket server started on port 3000");

wss.on("connection", (ws) => {

    console.log("Client connected");

    ws.on("message", (message) => {

        let data;

        try {
            data = JSON.parse(message);
        } catch {
            return;
        }

        const { type, payload } = data;

        switch (type) {

    case "join":

        if (!sender) {

            sender = ws;
            ws.role = "sender";
            console.log("Sender joined");

        } else {

            receiver = ws;
            ws.role = "receiver";
            console.log("Receiver joined");

        }

        break;

    case "offer":

        console.log("Offer received");

        if (receiver) {

            console.log("Forward offer -> receiver");

            receiver.send(JSON.stringify({
                type: "offer",
                payload
            }));

        } else {

            console.log("No receiver connected");

        }

        break;

    case "answer":

        console.log("Answer received");

        if (sender) {

            console.log("Forward answer -> sender");

            sender.send(JSON.stringify({
                type: "answer",
                payload
            }));

        }

        break;

    case "ice-candidate":

        console.log("ICE from", ws.role);

        if (ws.role === "sender" && receiver) {

            receiver.send(JSON.stringify({
                type: "ice-candidate",
                payload
            }));

        } else if (ws.role === "receiver" && sender) {

            sender.send(JSON.stringify({
                type: "ice-candidate",
                payload
            }));

        }

        break;

}

    });

    ws.on("close", () => {

        console.log("Client disconnected");

        if (ws === sender) sender = null;
        if (ws === receiver) receiver = null;

    });

});