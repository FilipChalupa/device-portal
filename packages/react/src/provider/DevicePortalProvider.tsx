import { Fragment, type FunctionComponent, type ReactNode } from 'react'
import { type Initiator, type PeerId } from '@device-portal/client'
import { PeerOptions, useDevicePortalPeer } from './useDevicePortalPeer'
import {
	useDevicePortalProvider,
	type DevicePortalProviderOptions,
} from './useDevicePortalProvider'

export const DevicePortalProvider = <Value = string, Message = string>({
	room,
	children,
	...options
}: {
	room: string
} & Omit<DevicePortalProviderOptions<Value, Message>, 'value'> &
	(
		| {
				value?: undefined
				children?: (
					Peer: FunctionComponent<PeerOptions<Value, Message>>,
					peerId: PeerId,
				) => ReactNode
		  }
		| {
				value: Value
				children?: undefined
		  }
	)) => {
	const { peers, initiator } = useDevicePortalProvider<Value, Message>(
		room,
		options,
	)

	if (!initiator || !children) {
		return null
	}

	return (
		<>
			{peers.map((peerId) => (
				<Fragment key={peerId}>
					{children(
						(peerOptions) => (
							<PeerBase
								peerId={peerId}
								initiator={initiator}
								options={{
									...peerOptions,
									serializeValue:
										peerOptions.serializeValue ?? options.serializeValue,
									deserializeMessage:
										peerOptions.deserializeMessage ??
										options.deserializeMessage,
								}}
							/>
						),
						peerId,
					)}
				</Fragment>
			))}
		</>
	)
}

const PeerBase = <Value = string, Message = string>({
	peerId,
	initiator,
	options,
}: {
	peerId: PeerId
	initiator: Initiator
	options: PeerOptions<Value, Message>
}) => {
	useDevicePortalPeer<Value, Message>(initiator, peerId, options)
	return null
}
