import { Fragment, type FunctionComponent, type ReactNode } from 'react'
import type { Initiator } from '../webrtc/Initiator'
import { PeerId } from '../webrtc/PeerId'
import { PeerOptions, useDevicePortalPeer } from './useDevicePortalPeer'
import {
	useDevicePortalProvider,
	type DevicePortalProviderOptions,
} from './useDevicePortalProvider'

export const DevicePortalProvider: FunctionComponent<
	{
		room: string
		data: string
		children?: (
			Peer: FunctionComponent<{ options: PeerOptions }>,
			peerId: PeerId,
		) => ReactNode
	} & DevicePortalProviderOptions
> = ({ room, data, children, ...options }) => {
	const { peers, initiator } = useDevicePortalProvider(room, data, options)

	if (!initiator || !children) {
		return null
	}

	return peers.map((peerId) => (
		<Fragment key={peerId}>
			{children(
				(props) => (
					<PeerBase peerId={peerId} initiator={initiator} {...props} />
				),
				peerId,
			)}
		</Fragment>
	))
}

const PeerBase: FunctionComponent<{
	peerId: PeerId
	initiator: Initiator
	options: PeerOptions
}> = ({ peerId, initiator, options }) => {
	useDevicePortalPeer(initiator, peerId, options)
	return null
}
