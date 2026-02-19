type State = {
    room: string;
    value: string;
    sendValueToInput: (value: string) => void;
};
export declare const useDevicePortalOutput: (room: string, options?: {
    websocketSignalingServer?: string;
}) => Pick<State, "value" | "sendValueToInput">;
export {};
