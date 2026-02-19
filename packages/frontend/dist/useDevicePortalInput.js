import { useState, useRef, useEffect } from 'react';
import { Initiator } from './webrtc/Initiator.js';

// @TODO: warn if one room is used by multiple useDevicePortalInput hooks more than once at the same time
var useDevicePortalInput = function (room, value, options) {
    var _a = useState(null), initiator = _a[0], setInitiator = _a[1];
    var onValueFromOutputRef = useRef(options === null || options === void 0 ? void 0 : options.onValueFromOutput);
    onValueFromOutputRef.current = options === null || options === void 0 ? void 0 : options.onValueFromOutput;
    useEffect(function () {
        var initiator = new Initiator(encodeURIComponent(room), {
            onValue: function (value) {
                var _a;
                (_a = onValueFromOutputRef.current) === null || _a === void 0 ? void 0 : _a.call(onValueFromOutputRef, value);
            },
            websocketSignalingServer: options === null || options === void 0 ? void 0 : options.websocketSignalingServer,
        });
        setInitiator(initiator);
        return function () {
            initiator.destroy();
            setInitiator(null);
        };
    }, [room, options === null || options === void 0 ? void 0 : options.websocketSignalingServer]);
    useEffect(function () {
        initiator === null || initiator === void 0 ? void 0 : initiator.send(value);
    }, [value, initiator]);
};

export { useDevicePortalInput };
//# sourceMappingURL=useDevicePortalInput.js.map
