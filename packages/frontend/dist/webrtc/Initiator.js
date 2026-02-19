import { __extends, __awaiter, __generator } from '../_virtual/_tslib.js';
import { Peer } from './Peer.js';

var Initiator = /** @class */ (function (_super) {
    __extends(Initiator, _super);
    function Initiator() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.role = 'initiator';
        return _this;
    }
    Initiator.prototype.connect = function () {
        return __awaiter(this, void 0, void 0, function () {
            var offer;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.connection) {
                            this.initializeConnectionAndChannel();
                        }
                        if (!this.connection) {
                            throw new Error('Connection is not initialized');
                        }
                        return [4 /*yield*/, this.connection.createOffer()];
                    case 1:
                        offer = _a.sent();
                        return [4 /*yield*/, this.setAndShareLocalDescription(offer)];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    Initiator.prototype.handleOffer = function (offer) {
        // Initiator does not handle offers
    };
    Initiator.prototype.handleAnswer = function (answer) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.connection) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.connection.setRemoteDescription(answer)];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: return [2 /*return*/];
                }
            });
        });
    };
    return Initiator;
}(Peer));

export { Initiator };
//# sourceMappingURL=Initiator.js.map
