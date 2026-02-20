import { Fragment, type FunctionComponent, type ReactNode } from 'react'
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
	children?: (
		PeerComponent: FunctionComponent<{ options: PeerOptions }>,
		peerId: PeerId,
	) => ReactNode
}> = ({ room, data, options, children }) => {
	const { peers, initiator } = useDevicePortalProvider(room, data, options)

	if (!initiator || !children) {
		return null
	}

	return peers.map((peerId) => (
		<Fragment key={peerId}>
			{children(
				(props) => (
					<Peer peerId={peerId} initiator={initiator} {...props} />
				),
				peerId,
			)}
		</Fragment>
	))
}

const Peer: FunctionComponent<{
	peerId: PeerId
	initiator: Initiator
	options: PeerOptions
}> = ({ peerId, initiator, options }) => {
	useDevicePortalPeer(initiator, peerId, options)
	return null
}
