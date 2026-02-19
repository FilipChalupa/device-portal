import { inherits as _inherits, createClass as _createClass, asyncToGenerator as _asyncToGenerator, classCallCheck as _classCallCheck, callSuper as _callSuper, defineProperty as _defineProperty, regeneratorRuntime as _regeneratorRuntime } from '../_virtual/_rollupPluginBabelHelpers.js';
import { Peer } from './Peer.js';

var Initiator = /*#__PURE__*/function (_Peer) {
  function Initiator() {
    var _this;
    _classCallCheck(this, Initiator);
    for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }
    _this = _callSuper(this, Initiator, [].concat(args));
    _defineProperty(_this, "role", 'initiator');
    return _this;
  }
  _inherits(Initiator, _Peer);
  return _createClass(Initiator, [{
    key: "connect",
    value: function () {
      var _connect = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee() {
        var offer;
        return _regeneratorRuntime().wrap(function _callee$(_context) {
          while (1) switch (_context.prev = _context.next) {
            case 0:
              if (!this.connection) {
                this.initializeConnectionAndChannel();
              }
              if (this.connection) {
                _context.next = 3;
                break;
              }
              throw new Error('Connection is not initialized');
            case 3:
              _context.next = 5;
              return this.connection.createOffer();
            case 5:
              offer = _context.sent;
              _context.next = 8;
              return this.setAndShareLocalDescription(offer);
            case 8:
            case "end":
              return _context.stop();
          }
        }, _callee, this);
      }));
      function connect() {
        return _connect.apply(this, arguments);
      }
      return connect;
    }()
  }, {
    key: "handleOffer",
    value: function handleOffer(offer) {
      // Initiator does not handle offers
    }
  }, {
    key: "handleAnswer",
    value: function () {
      var _handleAnswer = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee2(answer) {
        return _regeneratorRuntime().wrap(function _callee2$(_context2) {
          while (1) switch (_context2.prev = _context2.next) {
            case 0:
              if (!this.connection) {
                _context2.next = 3;
                break;
              }
              _context2.next = 3;
              return this.connection.setRemoteDescription(answer);
            case 3:
            case "end":
              return _context2.stop();
          }
        }, _callee2, this);
      }));
      function handleAnswer(_x) {
        return _handleAnswer.apply(this, arguments);
      }
      return handleAnswer;
    }()
  }]);
}(Peer);

export { Initiator };
//# sourceMappingURL=Initiator.js.map
