export default class WebRTC {

    constructor() {

        this.peer = null;
        this.stream = null;

        this.videoSender = null;

    }

    createPeer() {

        if (this.peer) {
            return;
        }

        this.peer = new RTCPeerConnection({

            iceServers: [
                {
                    urls: "stun:stun.l.google.com:19302"
                }
            ]

        });

        this.peer.oniceconnectionstatechange = () => {

            console.log(
                "ICE:",
                this.peer.iceConnectionState
            );

        };

        this.peer.onconnectionstatechange = () => {

            console.log(
                "Connection:",
                this.peer.connectionState
            );

        };

    }

    async start(stream) {

    this.stream = stream;

    if (!this.peer) {
        this.createPeer();
    }

    const senders = this.peer.getSenders();

    for (const track of stream.getTracks()) {

        const sender = senders.find(
            sender =>
                sender.track &&
                sender.track.kind === track.kind
        );

        if (sender) {

            await sender.replaceTrack(track);

            console.log(
                track.kind + " track replaced"
            );

        } else {

            this.peer.addTrack(
                track,
                stream
            );

            console.log(
                track.kind + " track added"
            );

        }

    }

    const offer =
        await this.peer.createOffer();

    await this.peer.setLocalDescription(
        offer
    );

    console.log("Offer created");

    return offer;

}

    async setRemoteDescription(description) {

    await this.peer.setRemoteDescription(description);

}

async createAnswer() {

    const answer = await this.peer.createAnswer();

    await this.peer.setLocalDescription(answer);

    return answer;

}

async setLocalDescription(description) {

    await this.peer.setLocalDescription(description);

}

async addIceCandidate(candidate) {

    if (!candidate) return;

    await this.peer.addIceCandidate(candidate);

}

}