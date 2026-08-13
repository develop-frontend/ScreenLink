import { WebRTCConnection } from "./webrtc.js";
import { SignalingClient } from "./signalingClient.js";

export class ConnectionManager {
    constructor() {
        this.signaling = null;
        this.webrtc = null;

        this.stream = null;

        this.role = null;

        this.wsUrl = null;

        this.room = "main";

        this.iceServers = {
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" }
            ]
        };
    }

    async start(role, stream = null) {
        this.role = role;
        this.stream = stream;

        this.wsUrl = `ws://${location.hostname}:3000`;

        this.signaling = new SignalingClient(
            this.onSignal.bind(this),
            this.onStatus.bind(this)
        );

        this.signaling.connect(this.wsUrl, this.room);
    }

    onStatus(status) {
        console.log("Signal:", status);
    }

    createPeer() {
        if (this.webrtc) return;

        this.webrtc = new WebRTCConnection(
            this.iceServers,

            (candidate) => {
                this.signaling.send("ice-candidate", candidate);
            },

            (stream) => {
                const video = document.getElementById("remoteVideo");
                if (video) {
                    video.srcObject = stream;
                }
            },

            (state) => {
                console.log(state);
            },

            async () => {
                if (this.role !== "sender") return;

                const offer = await this.webrtc.createOffer();

                this.signaling.send("offer", offer);
            }
        );

        if (this.stream) {
            this.webrtc.addLocalStream(this.stream);
        }
    }

    async onSignal(type, payload) {

        console.log(type);

        switch (type) {

            case "joined":

                this.createPeer();

                break;

            case "offer":

                this.createPeer();

                await this.webrtc.setRemoteDescription(payload);

                const answer = await this.webrtc.createAnswer();

                this.signaling.send("answer", answer);

                break;

            case "answer":

                await this.webrtc.setRemoteDescription(payload);

                break;

            case "ice-candidate":

                await this.webrtc.addIceCandidate(payload);

                break;
        }

    }

}