import { inherits as _inherits, createClass as _createClass, asyncToGenerator as _asyncToGenerator, classCallCheck as _classCallCheck, callSuper as _callSuper, defineProperty as _defineProperty, regeneratorRuntime as _regeneratorRuntime } from '../_virtual/_rollupPluginBabelHelpers.js';
import { Peer } from './Peer.js';

var Responder = /*#__PURE__*/function (_Peer) {
  function Responder() {
    var _this;
    _classCallCheck(this, Responder);
    for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }
    _this = _callSuper(this, Responder, [].concat(args));
    _defineProperty(_this, "role", 'responder');
    return _this;
  }
  _inherits(Responder, _Peer);
  return _createClass(Responder, [{
    key: "connect",
    value: function connect() {
      // The connection is initiated from the Peer class
      // The responder waits for an offer
      return Promise.resolve();
    }
  }, {
    key: "handleOffer",
    value: function () {
      var _handleOffer = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee(offer) {
        var answer;
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
              return this.connection.setRemoteDescription(offer);
            case 5:
              _context.next = 7;
              return this.connection.createAnswer();
            case 7:
              answer = _context.sent;
              _context.next = 10;
              return this.setAndShareLocalDescription(answer);
            case 10:
            case "end":
              return _context.stop();
          }
        }, _callee, this);
      }));
      function handleOffer(_x) {
        return _handleOffer.apply(this, arguments);
      }
      return handleOffer;
    }()
  }, {
    key: "handleAnswer",
    value: function handleAnswer(answer) {
      // Responder does not handle answers
    }
  }]);
}(Peer);

export { Responder };
//# sourceMappingURL=Responder.js.map
