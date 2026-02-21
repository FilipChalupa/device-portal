import { Fragment, type FunctionComponent, type ReactNode } from 'react'
import { type Initiator, type PeerId } from '@device-portal/client'
import { PeerOptions, useDevicePortalPeer } from './useDevicePortalPeer'
import {
	useDevicePortalProvider,
	type DevicePortalProviderOptions,
} from './useDevicePortalProvider'

export const DevicePortalProvider: FunctionComponent<
	{
		room: string
	} & Omit<DevicePortalProviderOptions, 'value'> &
		(
			| {
					value?: undefined
					children?: (
						Peer: FunctionComponent<PeerOptions>,
						peerId: PeerId,
					) => ReactNode
			  }
			| {
					value: string
					children?: undefined
			  }
		)
> = ({ room, children, ...options }) => {
	const { peers, initiator } = useDevicePortalProvider(room, options)

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
