import { Peer } from './Peer';
export declare class Responder extends Peer {
    protected role: "responder";
    protected connect(): Promise<void>;
    protected handleOffer(offer: RTCSessionDescriptionInit): Promise<void>;
    protected handleAnswer(answer: RTCSessionDescriptionInit): void;
}
