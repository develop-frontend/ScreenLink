import Capture from "../modules/capture.js";
import WindowManager from "../modules/windowManager.js";
import WebRTC from "../modules/webrtc.js";
import { SignalingClient } from "../modules/signalingClient.js";

const capture = new Capture();
const windowManager = new WindowManager();
const webrtc = new WebRTC();
const signaling = new SignalingClient(

    async (type, payload) => {

    console.log("MESSAGE:", type);

    switch (type) {

        case "answer":

            console.log("Answer received");

            await webrtc.setRemoteDescription(payload);

            break;

        case "ice-candidate":

            console.log("ICE received");

            await webrtc.addIceCandidate(payload);

            break;

        case "receiver-connected":

            console.log("Receiver connected");

            if (webrtc.stream) {

                const offer = await webrtc.start(webrtc.stream);

                signaling.send(
                    "offer",
                    offer
                );

            }

            break;    

    }

    },

    (status) => {

        console.log("STATUS:", status);

    }

);

const button = document.getElementById("refresh");
const container = document.getElementById("sources");
const video = document.getElementById("preview");

button.addEventListener("click", async () => {

    const sources = await windowManager.getSources();

    container.innerHTML = "";

    sources.forEach(source => {

        const div = document.createElement("button");

        div.style.display = "block";
        div.style.marginBottom = "10px";
        div.style.width = "500px";
        div.textContent = source.name;

        div.onclick = async () => {

        try {

            // Повідомляємо main process,
            // яке джерело вибрав користувач
            await window.api.selectSource(source.id);

            if (webrtc.stream) {

                webrtc.stream
                    .getTracks()
                    .forEach(track => track.stop());

            }

            // Запускаємо стандартний Screen Capture API
            const stream = await capture.start();

            webrtc.stream = stream;

            initPeer();

            video.srcObject = stream;

            const offer = await webrtc.start(stream);

            signaling.send(
                "offer",
                offer
            );

        } catch (err) {

            console.error(err);

        }

    };

        container.appendChild(div);

    });

});

function initPeer() {

    webrtc.createPeer();

    webrtc.peer.onicecandidate = (event) => {

        if (event.candidate) {

            signaling.send(
                "ice-candidate",
                event.candidate
            );

        }

    };

    webrtc.peer.ontrack = (event) => {

        console.log("Remote stream");

    };

}

async function connectToServer() {

    const isReceiver =
        await window.api.isReceiver();

    if (!isReceiver) {

        console.log("Starting as sender");

        signaling.connect(
            "ws://localhost:3000",
            "main"
        );

        return;
    }

    console.log("Receiver: waiting for sender...");

    const checkServer = setInterval(async () => {

        const server =
            await window.api.getServer();

        if (!server) {

            console.log(
                "Sender not found yet..."
            );

            return;
        }

        clearInterval(checkServer);

        console.log(
            "Sender found:",
            server.ip,
            server.port
        );

        signaling.connect(
            `ws://${server.ip}:${server.port}`,
            "main"
        );

    }, 500);

}

connectToServer();