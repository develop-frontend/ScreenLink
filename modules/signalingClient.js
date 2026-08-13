export class SignalingClient {
    /**
     * @param {Function} onMessage - Коллбек для обробки вхідних повідомлень (type, payload)
     * @param {Function} onStatusChange - Коллбек для сповіщення про зміну стану (connecting, connected, disconnected)
     */
    constructor(onMessage, onStatusChange) {
        this.url = null;
        this.roomId = null;
        this.socket = null;
        
        this.baseReconnectDelay = 1000;
        this.currentReconnectDelay = this.baseReconnectDelay;
        this.maxReconnectDelay = 30000;
        this.reconnectTimerId = null;
        
        this.isIntentionalClose = false;
        
        this.onMessage = onMessage;
        this.onStatusChange = onStatusChange;
    }

    /**
     * Починає з'єднання із сервером
     * @param {string} url - Адреса WebSocket
     * @param {string} roomId - Ідентифікатор кімнати
     */
    connect(url, roomId) {
        // Якщо вже є активне з'єднання (наприклад, переходимо в іншу кімнату) — закриваємо його
        if (this.socket) {
            this.disconnect();
        }

        this.url = url;
        this.roomId = roomId;
        this.isIntentionalClose = false;
        this.currentReconnectDelay = this.baseReconnectDelay;
        
        // Очищаємо залишковий таймер, якщо він був
        if (this.reconnectTimerId) {
            clearTimeout(this.reconnectTimerId);
            this.reconnectTimerId = null;
        }

        this._connect();
    }

    _connect() {
        if (this.onStatusChange) this.onStatusChange('connecting');

        const ws = new WebSocket(this.url);
        this.socket = ws; // Зберігаємо посилання на поточний активний сокет

        ws.onopen = () => {
            if (this.socket !== ws) return; // Guard: ігноруємо події від застарілих сокетів
            
            console.log('SignalingClient: Connected to server');
            if (this.onStatusChange) this.onStatusChange('connected');
            
            this.currentReconnectDelay = this.baseReconnectDelay;
            if (this.reconnectTimerId) {
                clearTimeout(this.reconnectTimerId);
                this.reconnectTimerId = null;
            }
            
            this.send('join', { roomId: this.roomId });
        };

        ws.onmessage = (event) => {
            if (this.socket !== ws) return; // Guard
            try {
                const message = JSON.parse(event.data);
                if (this.onMessage) {
                    this.onMessage(message.type, message.payload);
                }
            } catch (error) {
                console.error('SignalingClient: Parse error:', error);
            }
        };

        ws.onclose = () => {
            if (this.socket !== ws) return; // Guard: не чіпаємо стан, якщо це старий сокет
            
            console.log('SignalingClient: Disconnected');
            if (this.onStatusChange) this.onStatusChange('disconnected');
            
            this.socket = null;

            if (!this.isIntentionalClose) {
                this._scheduleReconnect();
            }
        };

        ws.onerror = (error) => {
            if (this.socket !== ws) return; // Guard
            console.error('SignalingClient: Socket error:', error);
        };
    }

    _scheduleReconnect() {
        if (this.reconnectTimerId) {
            clearTimeout(this.reconnectTimerId);
        }

        console.log(`SignalingClient: Reconnecting in ${this.currentReconnectDelay}ms...`);
        this.reconnectTimerId = setTimeout(() => {
            this._connect();
        }, this.currentReconnectDelay);

        this.currentReconnectDelay = Math.min(this.currentReconnectDelay * 2, this.maxReconnectDelay);
    }

    /**
     * Відправляє повідомлення на сервер
     * @param {string} type - Тип повідомлення
     * @param {Object} payload - Корисне навантаження
     */
    send(type, payload = {}) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ type, payload }));
        } else {
            console.warn(`SignalingClient: Cannot send '${type}', socket is not open.`);
            // Уникаємо черги (queue) для SDP/ICE повідомлень, бо краще дозволити WebRTC 
            // згенерувати нові кандидати/offer після успішного відновлення з'єднання.
        }
    }

    /**
     * Навмисно розриває з'єднання і зупиняє авто-перепідключення
     */
    disconnect() {
        this.isIntentionalClose = true;
        
        if (this.reconnectTimerId) {
            clearTimeout(this.reconnectTimerId);
            this.reconnectTimerId = null;
        }
        
        if (this.socket) {
            // onclose спрацює автоматично і виставить статус 'disconnected', це очікувано
            this.socket.close();
            this.socket = null;
        }
    }
}
