import { __awaiter, __generator } from '../_virtual/_tslib.js';
import { delay } from '../delay.js';
import { settings } from '../settings.js';

var Peer = /** @class */ (function () {
    function Peer(room, options) {
        if (options === void 0) { options = {}; }
        var _a, _b, _c;
        this.room = room;
        this.isDestroyed = false;
        this.connection = null;
        this.channel = null;
        this.value = null;
        this.socket = null;
        this.onValue = options.onValue;
        this.sendLastValueOnConnectAndReconnect =
            (_a = options.sendLastValueOnConnectAndReconnect) !== null && _a !== void 0 ? _a : true;
        this.websocketSignalingServer =
            (_b = options.websocketSignalingServer) !== null && _b !== void 0 ? _b : 'ws://localhost:8080';
        this.iceServers = (_c = options.iceServers) !== null && _c !== void 0 ? _c : settings.iceServers;
        this.run();
    }
    Peer.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.connect()];
                    case 1:
                        _a.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        error_1 = _a.sent();
                        queueMicrotask(function () {
                            throw error_1;
                        });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    Peer.prototype.connect = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            if (_this.isDestroyed) {
                return reject(new Error('Peer is destroyed'));
            }
            _this.socket = new WebSocket(_this.websocketSignalingServer);
            _this.socket.onopen = function () {
                var _a;
                (_a = _this.socket) === null || _a === void 0 ? void 0 : _a.send(JSON.stringify({ type: 'join-room', room: _this.room }));
                _this.initializeConnectionAndChannel();
                resolve();
            };
            _this.socket.onmessage = function (event) {
                var message = JSON.parse(event.data);
                switch (message.type) {
                    case 'offer':
                        _this.handleOffer(message.data);
                        break;
                    case 'answer':
                        _this.handleAnswer(message.data);
                        break;
                    case 'ice-candidate':
                        _this.handleIceCandidate(message.data);
                        break;
                }
            };
            _this.socket.onclose = function () { return __awaiter(_this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            this.close();
                            if (!!this.isDestroyed) return [3 /*break*/, 3];
                            return [4 /*yield*/, delay(1000)];
                        case 1:
                            _a.sent();
                            return [4 /*yield*/, this.run()]; // Reconnect
                        case 2:
                            _a.sent(); // Reconnect
                            _a.label = 3;
                        case 3: return [2 /*return*/];
                    }
                });
            }); };
            _this.socket.onerror = function (error) {
                console.error('WebSocket error:', error);
                _this.close();
                reject(error);
            };
        });
    };
    Peer.prototype.handleIceCandidate = function (candidate) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.connection) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.connection.addIceCandidate(new RTCIceCandidate(candidate))];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: return [2 /*return*/];
                }
            });
        });
    };
    Peer.prototype.close = function () {
        var _a, _b, _c;
        (_a = this.connection) === null || _a === void 0 ? void 0 : _a.close();
        this.connection = null;
        (_b = this.channel) === null || _b === void 0 ? void 0 : _b.close();
        this.channel = null;
        (_c = this.socket) === null || _c === void 0 ? void 0 : _c.close();
        this.socket = null;
    };
    Peer.prototype.destroy = function () {
        this.isDestroyed = true;
        this.close();
    };
    Peer.prototype.sendMessage = function (type, data) {
        var _a;
        if (((_a = this.socket) === null || _a === void 0 ? void 0 : _a.readyState) === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ type: type, room: this.room, data: data }));
        }
    };
    Peer.prototype.setAndShareLocalDescription = function (description) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.connection) {
                            throw new Error('Connection is not initialized');
                        }
                        return [4 /*yield*/, this.connection.setLocalDescription(description)];
                    case 1:
                        _a.sent();
                        this.sendMessage(description.type, description);
                        return [2 /*return*/];
                }
            });
        });
    };
    Peer.prototype.shareNewIceCandidate = function (event) {
        if (event.candidate) {
            this.sendMessage('ice-candidate', event.candidate.toJSON());
        }
    };
    Peer.prototype.send = function (value) {
        var _a;
        if (((_a = this.channel) === null || _a === void 0 ? void 0 : _a.readyState) === 'open') {
            this.channel.send(value);
        }
        this.value = { value: value };
    };
    Peer.prototype.initializeConnectionAndChannel = function () {
        var _this = this;
        this.connection = new RTCPeerConnection({ iceServers: this.iceServers });
        this.connection.onicecandidate = this.shareNewIceCandidate.bind(this);
        if (this.role === 'initiator') {
            this.channel = this.connection.createDataChannel(settings.channel.label, {
                negotiated: true,
                id: settings.channel.id,
            });
            this.channel.onopen = function () {
                var _a;
                if (_this.value && _this.sendLastValueOnConnectAndReconnect) {
                    (_a = _this.channel) === null || _a === void 0 ? void 0 : _a.send(_this.value.value);
                }
            };
            this.channel.onmessage = function (event) {
                var _a;
                (_a = _this.onValue) === null || _a === void 0 ? void 0 : _a.call(_this, event.data);
            };
        }
        else {
            this.connection.ondatachannel = function (event) {
                _this.channel = event.channel;
                _this.channel.onopen = function () {
                    var _a;
                    if (_this.value && _this.sendLastValueOnConnectAndReconnect) {
                        (_a = _this.channel) === null || _a === void 0 ? void 0 : _a.send(_this.value.value);
                    }
                };
                _this.channel.onmessage = function (event) {
                    var _a;
                    (_a = _this.onValue) === null || _a === void 0 ? void 0 : _a.call(_this, event.data);
                };
            };
        }
    };
    return Peer;
}());

export { Peer };
//# sourceMappingURL=Peer.js.map
