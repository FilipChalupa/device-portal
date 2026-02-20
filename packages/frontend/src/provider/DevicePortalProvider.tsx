import { type FunctionComponent } from 'react'
import type { Initiator } from '../webrtc/Initiator'
import { PeerId } from '../webrtc/PeerId'
import { PeerOptions, useDevicePortalPeer } from './useDevicePortalPeer'
import {
	useDevicePortalProvider,
	type DevicePortalProviderOptions,
} from './useDevicePortalProvider'

export const DevicePortalProvider: FunctionComponent<{
	room: string
	data: string
	options?: DevicePortalProviderOptions
	peerOptions?: (peer: PeerId) => PeerOptions
}> = ({ room, data, options, peerOptions }) => {
	const { peers, initiator } = useDevicePortalProvider(room, data, options)
	if (!initiator || !peerOptions) {
		return null
	}
	return peers.map((peerId) => (
		<Peer
			key={peerId}
			initiator={initiator}
			peerId={peerId}
			options={peerOptions(peerId)}
		/>
	))
}

const Peer: FunctionComponent<{
	peerId: PeerId
	initiator: Initiator
	options: PeerOptions
}> = ({ peerId, initiator }) => {
	useDevicePortalPeer(initiator, peerId)
	return null
}
