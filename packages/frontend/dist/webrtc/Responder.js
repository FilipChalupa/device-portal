import { __extends, __awaiter, __generator } from '../_virtual/_tslib.js';
import { Peer } from './Peer.js';

var Responder = /** @class */ (function (_super) {
    __extends(Responder, _super);
    function Responder() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.role = 'responder';
        return _this;
    }
    Responder.prototype.connect = function () {
        // The connection is initiated from the Peer class
        // The responder waits for an offer
        return Promise.resolve();
    };
    Responder.prototype.handleOffer = function (offer) {
        return __awaiter(this, void 0, void 0, function () {
            var answer;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.connection) {
                            this.initializeConnectionAndChannel();
                        }
                        if (!this.connection) {
                            throw new Error('Connection is not initialized');
                        }
                        return [4 /*yield*/, this.connection.setRemoteDescription(offer)];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.connection.createAnswer()];
                    case 2:
                        answer = _a.sent();
                        return [4 /*yield*/, this.setAndShareLocalDescription(answer)];
                    case 3:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    Responder.prototype.handleAnswer = function (answer) {
        // Responder does not handle answers
    };
    return Responder;
}(Peer));

export { Responder };
//# sourceMappingURL=Responder.js.map
