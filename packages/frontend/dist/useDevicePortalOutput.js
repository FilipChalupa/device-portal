import { slicedToArray as _slicedToArray } from './_virtual/_rollupPluginBabelHelpers.js';
import { useState, useMemo } from 'react';
import { Responder } from './webrtc/Responder.js';

// @TODO: warn if one room is used by multiple useDevicePortalOutput hooks more than once at the same time

var responders = {};
var useDevicePortalOutput = function useDevicePortalOutput(room, options) {
  var _useState = useState(null),
    _useState2 = _slicedToArray(_useState, 2),
    valueState = _useState2[0],
    setValueState = _useState2[1];
  var output = useMemo(function () {
    if (valueState === null || valueState.room !== room) {
      return null;
    }
    return {
      value: valueState.value,
      sendValueToInput: valueState.sendValueToInput
    };
  }, []);
  if (!responders[room]) {
    var _Promise$withResolver = Promise.withResolvers(),
      firstValuePromise = _Promise$withResolver.promise,
      firstValueResolve = _Promise$withResolver.resolve;
    var responder = new Responder(room, {
      onValue: function onValue(value) {
        responders[room].output = {
          value: value,
          sendValueToInput: sendValueToInput
        };
        responders[room].setValueState({
          room: room,
          value: value,
          sendValueToInput: sendValueToInput
        });
        firstValueResolve(value);
      },
      sendLastValueOnConnectAndReconnect: false,
      websocketSignalingServer: options === null || options === void 0 ? void 0 : options.websocketSignalingServer
    });
    var sendValueToInput = function sendValueToInput(value_0) {
      responder.send(value_0);
    };
    responders[room] = {
      responder: responder,
      firstValuePromise: firstValuePromise,
      output: null,
      setValueState: setValueState
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
