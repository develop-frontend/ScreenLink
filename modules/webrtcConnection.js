export class WebRTCConnection {
    /**
     * Ініціалізує WebRTC з'єднання
     * @param {Object} config - Конфігурація RTCPeerConnection
     * @param {Function} onIceCandidate - Коллбек для відправки ICE-кандидата
     * @param {Function} onTrack - Коллбек для отримання віддаленого потоку
     * @param {Function} onStateChange - Коллбек для зміни стану з'єднання (опціонально)
     * @param {Function} onNegotiationNeeded - Коллбек для renegotiation (опціонально)
     */
    constructor(config, onIceCandidate, onTrack, onStateChange, onNegotiationNeeded) {
        this.peerConnection = new RTCPeerConnection(config);
        
        this.pendingCandidates = [];
        this.remoteDescriptionSet = false;
        this.senders = new Map(); // Зберігаємо senders, щоб уникнути дублювання треків
        
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                onIceCandidate(event.candidate);
            }
        };

        this.peerConnection.ontrack = (event) => {
            if (event.streams && event.streams[0]) {
                onTrack(event.streams[0]);
            }
        };
        
        this.peerConnection.onconnectionstatechange = () => {
            const state = this.peerConnection.connectionState;
            console.log('WebRTC Connection State:', state);
            if (onStateChange) onStateChange(state);
        };

        this.peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE Connection State:', this.peerConnection.iceConnectionState);
        };

        this.peerConnection.onnegotiationneeded = () => {
            if (onNegotiationNeeded) onNegotiationNeeded();
        };
    }

    /**
     * Додає або оновлює локальний медіапотік
     * @param {MediaStream} stream 
     */
    addLocalStream(stream) {
        stream.getTracks().forEach(track => {
            const existingSender = this.senders.get(track.kind);
            if (existingSender) {
                // Якщо трек такого типу вже є, просто замінюємо його
                existingSender.replaceTrack(track);
            } else {
                // Інакше додаємо новий і запам'ятовуємо sender
                let sender;
                
                if (track.kind === 'video' && typeof RTCRtpSender.getCapabilities !== 'undefined') {
                    // Оптимізація кодека: Надаємо перевагу VP9 або H264 (краща компресія для екрана)
                    const transceiver = this.peerConnection.addTransceiver(track, { streams: [stream] });
                    sender = transceiver.sender;
                    
                    if (transceiver.setCodecPreferences) {
                        const codecs = RTCRtpSender.getCapabilities('video').codecs;
                        // Сортуємо кодеки: спочатку VP9, потім H264, потім інші
                        const preferredCodecs = [
                            ...codecs.filter(c => c.mimeType === 'video/VP9'),
                            ...codecs.filter(c => c.mimeType === 'video/H264'),
                            ...codecs.filter(c => c.mimeType !== 'video/VP9' && c.mimeType !== 'video/H264')
                        ];
                        try {
                            transceiver.setCodecPreferences(preferredCodecs);
                        } catch (e) {
                            console.warn('Не вдалося встановити пріоритет кодеків:', e);
                        }
                    }
                } else {
                    sender = this.peerConnection.addTrack(track, stream);
                }
                
                // Оптимізація бітрейту та пріоритетності (Latency)
                if (track.kind === 'video') {
                    const params = sender.getParameters();
                    if (!params.encodings) params.encodings = [{}];
                    
                    params.encodings[0].maxBitrate = 5000000; // Ліміт 5 Mbps
                    params.encodings[0].networkPriority = 'high'; // Зменшення мережевої затримки
                    params.degradationPreference = 'maintain-resolution'; // Жертвувати FPS, а не чіткістю
                    
                    sender.setParameters(params).catch(e => console.warn('Не вдалося застосувати параметри відео:', e));
                }

                this.senders.set(track.kind, sender);
            }
        });
    }

    /**
     * Створює Offer
     * @returns {Promise<RTCSessionDescriptionInit>}
     */
    async createOffer() {
        try {
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            return this.peerConnection.localDescription;
        } catch (error) {
            console.error('Помилка створення Offer:', error);
            throw error;
        }
    }

    /**
     * Створює Answer
     * @returns {Promise<RTCSessionDescriptionInit>}
     */
    async createAnswer() {
        try {
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            return this.peerConnection.localDescription;
        } catch (error) {
            console.error('Помилка створення Answer:', error);
            throw error;
        }
    }

    /**
     * Зберігає віддалений опис та застосовує чергу ICE-кандидатів
     * @param {RTCSessionDescriptionInit} sdp 
     */
    async setRemoteDescription(sdp) {
        try {
            // plain-object sdp замість new RTCSessionDescription()
            await this.peerConnection.setRemoteDescription(sdp);
            this.remoteDescriptionSet = true;
            
            // Застосувати всі кандидати, що прийшли завчасно (Trickle ICE)
            for (const candidate of this.pendingCandidates) {
                await this.peerConnection.addIceCandidate(candidate);
            }
            this.pendingCandidates = [];
        } catch (error) {
            console.error('Помилка встановлення remote description:', error);
            throw error;
        }
    }

    /**
     * Додає віддалений ICE-кандидат (або ставить у чергу, якщо SDP ще не встановлено)
     * @param {RTCIceCandidateInit} candidate 
     */
    async addIceCandidate(candidate) {
        if (!candidate) return;
        
        try {
            if (!this.remoteDescriptionSet) {
                this.pendingCandidates.push(candidate);
                return;
            }
            // plain-object candidate замість new RTCIceCandidate()
            await this.peerConnection.addIceCandidate(candidate);
        } catch (error) {
            console.error('Помилка додавання ICE кандидата:', error);
            throw error;
        }
    }

    /**
     * Закриває з'єднання та звільняє ресурси (включаючи пам'ять від колбеків)
     */
    close() {
        if (this.peerConnection) {
            // Відв'язуємо колбеки, щоб GC міг зібрати об'єкт
            this.peerConnection.onicecandidate = null;
            this.peerConnection.ontrack = null;
            this.peerConnection.onconnectionstatechange = null;
            this.peerConnection.oniceconnectionstatechange = null;
            this.peerConnection.onnegotiationneeded = null;
            
            this.peerConnection.close();
            this.peerConnection = null;
            console.log('WebRTC Connection closed');
        }
        
        this.pendingCandidates = [];
        this.senders.clear();
        this.remoteDescriptionSet = false;
    }
}
