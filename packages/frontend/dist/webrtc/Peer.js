import { createClass as _createClass, asyncToGenerator as _asyncToGenerator, regeneratorRuntime as _regeneratorRuntime, classCallCheck as _classCallCheck, defineProperty as _defineProperty } from '../_virtual/_rollupPluginBabelHelpers.js';
import { delay } from '../delay.js';
import { settings } from '../settings.js';

var Peer = /*#__PURE__*/function () {
  function Peer(room) {
    var _options$sendLastValu, _options$websocketSig, _options$iceServers;
    var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    _classCallCheck(this, Peer);
    _defineProperty(this, "isDestroyed", false);
    _defineProperty(this, "connection", null);
    _defineProperty(this, "channel", null);
    _defineProperty(this, "value", null);
    _defineProperty(this, "socket", null);
    this.room = room;
    this.onValue = options.onValue;
    this.sendLastValueOnConnectAndReconnect = (_options$sendLastValu = options.sendLastValueOnConnectAndReconnect) !== null && _options$sendLastValu !== void 0 ? _options$sendLastValu : true;
    this.websocketSignalingServer = (_options$websocketSig = options.websocketSignalingServer) !== null && _options$websocketSig !== void 0 ? _options$websocketSig : 'ws://localhost:8080';
    this.iceServers = (_options$iceServers = options.iceServers) !== null && _options$iceServers !== void 0 ? _options$iceServers : settings.iceServers;
    this.run();
  }
  return _createClass(Peer, [{
    key: "run",
    value: function () {
      var _run = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee() {
        return _regeneratorRuntime().wrap(function _callee$(_context) {
          while (1) switch (_context.prev = _context.next) {
            case 0:
              _context.prev = 0;
              _context.next = 3;
              return this.connect();
            case 3:
              _context.next = 8;
              break;
            case 5:
              _context.prev = 5;
              _context.t0 = _context["catch"](0);
              queueMicrotask(function () {
                throw _context.t0;
              });
            case 8:
            case "end":
              return _context.stop();
          }
        }, _callee, this, [[0, 5]]);
      }));
      function run() {
        return _run.apply(this, arguments);
      }
      return run;
    }()
  }, {
    key: "connect",
    value: function connect() {
      var _this = this;
      return new Promise(function (resolve, reject) {
        if (_this.isDestroyed) {
          return reject(new Error('Peer is destroyed'));
        }
        _this.socket = new WebSocket(_this.websocketSignalingServer);
        _this.socket.onopen = function () {
          var _this$socket;
          (_this$socket = _this.socket) === null || _this$socket === void 0 || _this$socket.send(JSON.stringify({
            type: 'join-room',
            room: _this.room
          }));
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
        _this.socket.onclose = /*#__PURE__*/_asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee2() {
          return _regeneratorRuntime().wrap(function _callee2$(_context2) {
            while (1) switch (_context2.prev = _context2.next) {
              case 0:
                _this.close();
                if (_this.isDestroyed) {
                  _context2.next = 6;
                  break;
                }
                _context2.next = 4;
                return delay(1000);
              case 4:
                _context2.next = 6;
                return _this.run();
              case 6:
              case "end":
                return _context2.stop();
            }
          }, _callee2);
        }));
        _this.socket.onerror = function (error) {
          console.error('WebSocket error:', error);
          _this.close();
          reject(error);
        };
      });
    }
  }, {
    key: "handleIceCandidate",
    value: function () {
      var _handleIceCandidate = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee3(candidate) {
        return _regeneratorRuntime().wrap(function _callee3$(_context3) {
          while (1) switch (_context3.prev = _context3.next) {
            case 0:
              if (!this.connection) {
                _context3.next = 3;
                break;
              }
              _context3.next = 3;
              return this.connection.addIceCandidate(new RTCIceCandidate(candidate));
            case 3:
            case "end":
              return _context3.stop();
          }
        }, _callee3, this);
      }));
      function handleIceCandidate(_x) {
        return _handleIceCandidate.apply(this, arguments);
      }
      return handleIceCandidate;
    }()
  }, {
    key: "close",
    value: function close() {
      var _this$connection, _this$channel, _this$socket2;
      (_this$connection = this.connection) === null || _this$connection === void 0 || _this$connection.close();
      this.connection = null;
      (_this$channel = this.channel) === null || _this$channel === void 0 || _this$channel.close();
      this.channel = null;
      (_this$socket2 = this.socket) === null || _this$socket2 === void 0 || _this$socket2.close();
      this.socket = null;
    }
  }, {
    key: "destroy",
    value: function destroy() {
      this.isDestroyed = true;
      this.close();
    }
  }, {
    key: "sendMessage",
    value: function sendMessage(type, data) {
      var _this$socket3;
      if (((_this$socket3 = this.socket) === null || _this$socket3 === void 0 ? void 0 : _this$socket3.readyState) === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({
          type: type,
          room: this.room,
          data: data
        }));
      }
    }
  }, {
    key: "setAndShareLocalDescription",
    value: function () {
      var _setAndShareLocalDescription = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee4(description) {
        return _regeneratorRuntime().wrap(function _callee4$(_context4) {
          while (1) switch (_context4.prev = _context4.next) {
            case 0:
              if (this.connection) {
                _context4.next = 2;
                break;
              }
              throw new Error('Connection is not initialized');
            case 2:
              _context4.next = 4;
              return this.connection.setLocalDescription(description);
            case 4:
              this.sendMessage(description.type, description);
            case 5:
            case "end":
              return _context4.stop();
          }
        }, _callee4, this);
      }));
      function setAndShareLocalDescription(_x2) {
        return _setAndShareLocalDescription.apply(this, arguments);
      }
      return setAndShareLocalDescription;
    }()
  }, {
    key: "shareNewIceCandidate",
    value: function shareNewIceCandidate(event) {
      if (event.candidate) {
        this.sendMessage('ice-candidate', event.candidate.toJSON());
      }
    }
  }, {
    key: "send",
    value: function send(value) {
      var _this$channel2;
      if (((_this$channel2 = this.channel) === null || _this$channel2 === void 0 ? void 0 : _this$channel2.readyState) === 'open') {
        this.channel.send(value);
      }
      this.value = {
        value: value
      };
    }
  }, {
    key: "initializeConnectionAndChannel",
    value: function initializeConnectionAndChannel() {
      var _this2 = this;
      this.connection = new RTCPeerConnection({
        iceServers: this.iceServers
      });
      this.connection.onicecandidate = this.shareNewIceCandidate.bind(this);
      if (this.role === 'initiator') {
        this.channel = this.connection.createDataChannel(settings.channel.label, {
          negotiated: true,
          id: settings.channel.id
        });
        this.channel.onopen = function () {
          if (_this2.value && _this2.sendLastValueOnConnectAndReconnect) {
            var _this2$channel;
            (_this2$channel = _this2.channel) === null || _this2$channel === void 0 || _this2$channel.send(_this2.value.value);
          }
        };
        this.channel.onmessage = function (event) {
          var _this2$onValue;
          (_this2$onValue = _this2.onValue) === null || _this2$onValue === void 0 || _this2$onValue.call(_this2, event.data);
        };
      } else {
        this.connection.ondatachannel = function (event) {
          _this2.channel = event.channel;
          _this2.channel.onopen = function () {
            if (_this2.value && _this2.sendLastValueOnConnectAndReconnect) {
              var _this2$channel2;
              (_this2$channel2 = _this2.channel) === null || _this2$channel2 === void 0 || _this2$channel2.send(_this2.value.value);
            }
          };
          _this2.channel.onmessage = function (event) {
            var _this2$onValue2;
            (_this2$onValue2 = _this2.onValue) === null || _this2$onValue2 === void 0 || _this2$onValue2.call(_this2, event.data);
          };
        };
      }
    }
  }]);
}();

export { Peer };
//# sourceMappingURL=Peer.js.map
