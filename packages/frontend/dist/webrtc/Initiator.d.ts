import { Peer } from './Peer';
export declare class Initiator extends Peer {
    protected role: "initiator";
    protected connect(): Promise<void>;
    protected handleOffer(offer: RTCSessionDescriptionInit): void;
    protected handleAnswer(answer: RTCSessionDescriptionInit): Promise<void>;
}
