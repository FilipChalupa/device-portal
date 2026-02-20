import { Fragment, type FunctionComponent, type ReactNode } from 'react'
import {
	useDevicePortalProvider,
	type DevicePortalProviderOptions,
} from './useDevicePortalProvider'
import { PeerId } from '../webrtc/PeerId'

export const DevicePortalProvider: FunctionComponent<{
	room: string
	data: string
	options?: DevicePortalProviderOptions
	renderPeer?: (peer: PeerId) => ReactNode
}> = ({ room, data, options, renderPeer }) => {
	const { peers, initiator } = useDevicePortalProvider(room, data, options)
	if (!initiator || !renderPeer) {
		return null
	}
	return peers.map((peer) => <Fragment key={peer}>{renderPeer(peer)}</Fragment>)
}
