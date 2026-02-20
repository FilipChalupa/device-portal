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
		value: string
		children?: (
			Peer: FunctionComponent<PeerOptions>,
			peerId: PeerId,
		) => ReactNode
	} & DevicePortalProviderOptions
> = ({ room, value, children, ...options }) => {
	const { peers, initiator } = useDevicePortalProvider(room, value, options)

	if (!initiator || !children) {
		return null
	}

	return peers.map((peerId) => (
		<Fragment key={peerId}>
			{children(
				(options) => (
					<PeerBase peerId={peerId} initiator={initiator} options={options} />
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
