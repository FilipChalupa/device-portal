export declare abstract class Peer {
    protected readonly room: string;
    protected isDestroyed: boolean;
    protected connection: RTCPeerConnection | null;
    protected channel: RTCDataChannel | null;
    protected abstract role: 'initiator' | 'responder';
    protected value: {
        value: string;
    } | null;
    protected readonly onValue: ((value: string) => void) | undefined;
    protected readonly sendLastValueOnConnectAndReconnect: boolean;
    protected readonly websocketSignalingServer: string;
    protected readonly iceServers: Array<RTCIceServer>;
    protected socket: WebSocket | null;
    constructor(room: string, options?: {
        onValue?: (value: string) => void;
        sendLastValueOnConnectAndReconnect?: boolean;
        websocketSignalingServer?: string;
        iceServers?: Array<RTCIceServer>;
    });
    protected run(): Promise<void>;
    protected connect(): Promise<void>;
    protected abstract handleOffer(offer: RTCSessionDescriptionInit): void;
    protected abstract handleAnswer(answer: RTCSessionDescriptionInit): void;
    protected handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void>;
    protected close(): void;
    destroy(): void;
    protected sendMessage(type: string, data: any): void;
    protected setAndShareLocalDescription(description: RTCSessionDescriptionInit): Promise<void>;
    protected shareNewIceCandidate(event: RTCPeerConnectionIceEvent): void;
    send(value: string): void;
    protected initializeConnectionAndChannel(): void;
}
