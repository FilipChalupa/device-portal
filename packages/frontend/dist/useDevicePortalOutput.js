import { useState, useMemo } from 'react';
import { Responder } from './webrtc/Responder.js';

var responders = {};
var useDevicePortalOutput = function (room, options) {
    var _a = useState(null), valueState = _a[0], setValueState = _a[1];
    var output = useMemo(function () {
        if (valueState === null || valueState.room !== room) {
            return null;
        }
        return {
            value: valueState.value,
            sendValueToInput: valueState.sendValueToInput,
        };
    }, []);
    if (!responders[room]) {
        var _b = Promise.withResolvers(), firstValuePromise = _b.promise, firstValueResolve_1 = _b.resolve;
        var responder_1 = new Responder(room, {
            onValue: function (value) {
                responders[room].output = { value: value, sendValueToInput: sendValueToInput_1 };
                responders[room].setValueState({ room: room, value: value, sendValueToInput: sendValueToInput_1 });
                firstValueResolve_1(value);
            },
            sendLastValueOnConnectAndReconnect: false,
            websocketSignalingServer: options === null || options === void 0 ? void 0 : options.websocketSignalingServer,
        });
        var sendValueToInput_1 = function (value) {
            responder_1.send(value);
        };
        responders[room] = {
            responder: responder_1,
            firstValuePromise: firstValuePromise,
            output: null,
            setValueState: setValueState,
        };
    }
    responders[room].setValueState = setValueState;
    if (output) {
        return output;
    }
    if (responders[room].output) {
        return responders[room].output;
    }
    throw responders[room].firstValuePromise;
};

export { useDevicePortalOutput };
//# sourceMappingURL=useDevicePortalOutput.js.map
