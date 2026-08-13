export default class NetworkManager {

    constructor(signalingClient) {

        this.signaling = signalingClient;

    }

    async connect() {

        await this.signaling.connect();

    }

    send(type, payload) {

        this.signaling.send(type, payload);

    }

    disconnect() {

        this.signaling.disconnect();

    }

}