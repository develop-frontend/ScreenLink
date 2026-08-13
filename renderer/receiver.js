import WebRTC from "../modules/webrtc.js";
import { SignalingClient } from "../modules/signalingClient.js";

const video = document.getElementById("preview");
const status = document.getElementById("status");

const webrtc = new WebRTC();

const signaling = new SignalingClient(

    async (type, payload) => {

        console.log("MESSAGE:", type);

        switch (type) {

            case "offer":

                console.log("Offer received");

                webrtc.createPeer();

                webrtc.peer.ontrack = (event) => {

                    console.log("Remote stream");

                    video.srcObject = event.streams[0];

                };

                webrtc.peer.onicecandidate = (event) => {

                    if (event.candidate) {

                        signaling.send(
                            "ice-candidate",
                            event.candidate
                        );

                    }

                };

                await webrtc.setRemoteDescription(payload);

                const answer = await webrtc.createAnswer();

                signaling.send(
                    "answer",
                    answer
                );

                break;

            case "ice-candidate":

                console.log("ICE received");

                await webrtc.addIceCandidate(payload);

                break;

        }

    },

    (connectionStatus) => {

    console.log("STATUS:", connectionStatus);

    switch (connectionStatus) {

        case "connecting":

            status.textContent = "Підключення...";

            break;

        case "connected":

            status.textContent = "Підключено";

            break;

        case "disconnected":

            status.textContent = "Втрачено з'єднання";

            break;

    }

}

);

async function connect() {

    while (true) {

        const server = await window.api.getServer();

        if (server) {

            status.textContent = `Підключення до ${server.ip}...`;

            signaling.connect(

                `ws://${server.ip}:${server.port}`,

                "main"

            );

            return;

        }

        await new Promise(resolve => setTimeout(resolve, 1000));

    }

}

connect();