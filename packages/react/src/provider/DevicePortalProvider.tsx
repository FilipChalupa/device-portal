import { type PeerId, type Host } from '@device-portal/client'
import { Fragment, type FunctionComponent, type ReactNode } from 'react'
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
	const { peers, provider } = useDevicePortalProvider(room, options)

	if (!provider || !children) {
		return null
	}

	return peers.map((peerId) => (
		<Fragment key={peerId}>
			{children(
				(options) => (
					<PeerBase peerId={peerId} provider={provider} options={options} />
				),
				peerId,
			)}
		</Fragment>
	))
}

const PeerBase: FunctionComponent<{
	peerId: PeerId
	provider: Host
	options: PeerOptions
}> = ({ peerId, provider, options }) => {
	useDevicePortalPeer(provider, peerId, options)
	return null
}
