import { slicedToArray as _slicedToArray } from './_virtual/_rollupPluginBabelHelpers.js';
import { useState, useRef, useEffect } from 'react';
import { Initiator } from './webrtc/Initiator.js';

// @TODO: warn if one room is used by multiple useDevicePortalInput hooks more than once at the same time

var useDevicePortalInput = function useDevicePortalInput(room, value, options) {
  var _useState = useState(null),
    _useState2 = _slicedToArray(_useState, 2),
    initiator = _useState2[0],
    setInitiator = _useState2[1];
  var onValueFromOutputRef = useRef(options === null || options === void 0 ? void 0 : options.onValueFromOutput);
  onValueFromOutputRef.current = options === null || options === void 0 ? void 0 : options.onValueFromOutput;
  useEffect(function () {
    var initiator_0 = new Initiator(encodeURIComponent(room), {
      onValue: function onValue(value_0) {
        var _onValueFromOutputRef;
        (_onValueFromOutputRef = onValueFromOutputRef.current) === null || _onValueFromOutputRef === void 0 || _onValueFromOutputRef.call(onValueFromOutputRef, value_0);
      },
      websocketSignalingServer: options === null || options === void 0 ? void 0 : options.websocketSignalingServer
    });
    setInitiator(initiator_0);
    return function () {
      initiator_0.destroy();
      setInitiator(null);
    };
  }, [room, options === null || options === void 0 ? void 0 : options.websocketSignalingServer]);
  useEffect(function () {
    initiator === null || initiator === void 0 || initiator.send(value);
  }, [value, initiator]);
};

export { useDevicePortalInput };
//# sourceMappingURL=useDevicePortalInput.js.map
