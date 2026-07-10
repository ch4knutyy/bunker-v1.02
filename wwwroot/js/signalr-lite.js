(function (global) {
    if (global.signalR) return;

    const recordSeparator = String.fromCharCode(0x1e);

    class HubConnectionBuilder {
        constructor() {
            this._url = "";
        }

        withUrl(url) {
            this._url = url;
            return this;
        }

        withAutomaticReconnect() {
            return this;
        }

        build() {
            return new HubConnection(this._url);
        }
    }

    class HubConnection {
        constructor(url) {
            this.url = url;
            this.connectionId = null;
            this.state = "Disconnected";
            this._socket = null;
            this._handlers = new Map();
            this._callbacks = new Map();
            this._reconnectingHandlers = [];
            this._reconnectedHandlers = [];
            this._closeHandlers = [];
            this._nextInvocationId = 1;
            this._buffer = "";
            this._handshakeComplete = false;
            this._handshakeResolve = null;
            this._handshakeReject = null;
        }

        on(methodName, handler) {
            const key = String(methodName || "").toLowerCase();
            if (!this._handlers.has(key)) this._handlers.set(key, []);
            this._handlers.get(key).push(handler);
        }

        off(methodName, handler) {
            const key = String(methodName || "").toLowerCase();
            if (!handler) {
                this._handlers.delete(key);
                return;
            }

            const handlers = this._handlers.get(key) || [];
            this._handlers.set(key, handlers.filter(item => item !== handler));
        }

        onreconnecting(handler) {
            if (typeof handler === "function") this._reconnectingHandlers.push(handler);
        }

        onreconnected(handler) {
            if (typeof handler === "function") this._reconnectedHandlers.push(handler);
        }

        onclose(handler) {
            if (typeof handler === "function") this._closeHandlers.push(handler);
        }

        async start() {
            if (this.state === "Connected") return;
            this.state = "Connecting";

            const negotiateUrl = this._buildNegotiateUrl();
            const negotiateResponse = await fetch(negotiateUrl, { method: "POST" });
            if (!negotiateResponse.ok) {
                this.state = "Disconnected";
                throw new Error(`SignalR negotiate failed: ${negotiateResponse.status}`);
            }

            const negotiate = await negotiateResponse.json();
            this.connectionId = negotiate.connectionId || null;

            const socketUrl = this._buildSocketUrl(negotiate.connectionToken || negotiate.connectionId);
            await new Promise((resolve, reject) => {
                this._handshakeResolve = resolve;
                this._handshakeReject = reject;
                this._socket = new WebSocket(socketUrl);

                this._socket.onopen = () => {
                    this._sendRaw({ protocol: "json", version: 1 });
                };

                this._socket.onerror = () => {
                    this.state = "Disconnected";
                    reject(new Error("SignalR websocket error"));
                };

                this._socket.onclose = () => {
                    this.state = "Disconnected";
                    this._rejectPending(new Error("SignalR connection closed"));
                    this._closeHandlers.forEach(handler => handler());
                };

                this._socket.onmessage = event => this._receive(String(event.data || ""));
            });

            this.state = "Connected";
        }

        stop() {
            if (this._socket) this._socket.close();
            this.state = "Disconnected";
        }

        invoke(methodName, ...args) {
            if (!this._socket || this.state !== "Connected") {
                return Promise.reject(new Error("SignalR connection is not connected"));
            }

            const invocationId = String(this._nextInvocationId++);
            const message = {
                type: 1,
                invocationId,
                target: methodName,
                arguments: args
            };

            return new Promise((resolve, reject) => {
                this._callbacks.set(invocationId, { resolve, reject });
                this._sendRaw(message);
            });
        }

        _buildNegotiateUrl() {
            const url = new URL(this.url, global.location.href);
            const path = url.pathname.replace(/\/$/, "") + "/negotiate";
            url.pathname = path;
            url.searchParams.set("negotiateVersion", "1");
            return url.toString();
        }

        _buildSocketUrl(connectionToken) {
            const url = new URL(this.url, global.location.href);
            url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
            if (connectionToken) url.searchParams.set("id", connectionToken);
            return url.toString();
        }

        _sendRaw(message) {
            this._socket.send(JSON.stringify(message) + recordSeparator);
        }

        _receive(data) {
            this._buffer += data;
            const records = this._buffer.split(recordSeparator);
            this._buffer = records.pop() || "";

            records
                .filter(Boolean)
                .forEach(record => this._handleRecord(record));
        }

        _handleRecord(record) {
            const message = JSON.parse(record);
            if (!this._handshakeComplete) {
                this._handshakeComplete = true;
                if (message.error) {
                    this.state = "Disconnected";
                    this._handshakeReject?.(new Error(message.error));
                    return;
                }

                this._handshakeResolve?.();
                return;
            }

            if (message.type === 1) {
                const handlers = this._handlers.get(String(message.target || "").toLowerCase()) || [];
                handlers.forEach(handler => handler(...(message.arguments || [])));
                return;
            }

            if (message.type === 3) {
                const callback = this._callbacks.get(String(message.invocationId));
                if (!callback) return;
                this._callbacks.delete(String(message.invocationId));
                if (message.error) callback.reject(new Error(message.error));
                else callback.resolve(message.result);
                return;
            }

            if (message.type === 7) {
                this.stop();
            }
        }

        _rejectPending(error) {
            this._callbacks.forEach(callback => callback.reject(error));
            this._callbacks.clear();
        }
    }

    global.signalR = {
        HubConnectionBuilder,
        HubConnectionState: {
            Disconnected: "Disconnected",
            Connecting: "Connecting",
            Connected: "Connected",
            Reconnecting: "Reconnecting"
        }
    };
})(window);
