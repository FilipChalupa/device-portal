import {
	Host,
	generatePeerId,
	type BrowserDirectOption,
	type PeerId,
} from '@device-portal/client'
import { useEffect, useRef, useState } from 'react'

// @TODO: warn if one room is used by multiple useDevicePortalProvider hooks more than once at the same time

/**
 * Configuration options for the Device Portal Provider.
 */
export type DevicePortalProviderOptions<Meta = unknown> = {
	/** The value to share with connected consumers. A function receives the peerId and can return a per-peer value. */
	value?: string | ((peerId: PeerId) => string)
	/** URL of the signaling server, or null to disable. */
	webSocketSignalingServer?: string | null
	/** Callback when a consumer sends a message back to the provider. */
	onMessageFromConsumer?: (value: string, peerId: PeerId) => void
	/** Whether to automatically send the last 'value' to new consumers. Default: true. */
	sendLastValueOnConnectAndReconnect?: boolean
	/** Maximum number of concurrent consumer connections. Default: 1. */
	maxClients?: number
	/** Browser direct signaling options. */
	browserDirect?: BrowserDirectOption
	/** Lists the room under this group on the signaling server for `useGroupRooms`. */
	group?: string
	/**
	 * Arbitrary JSON published with the group listing, e.g. a game name. Kept
	 * under 1 kB. Changes are pushed to the listing without reconnecting.
	 */
	meta?: Meta
}

/**
 * A React hook that creates a Device Portal room and shares a value with all joining consumers.
 *
 * @param room - The unique room ID.
 * @param options - Provider configuration options.
 * @returns An object containing the list of connected peers and the underlying Provider instance.
 */
export const useDevicePortalProvider = <Meta = unknown>(
	room: string,
	options: DevicePortalProviderOptions<Meta> = {},
) => {
	const [provider, setProvider] = useState<Host<Meta> | null>(null)
	const [peers, setPeers] = useState<PeerId[]>([])
	const onMessageFromConsumerRef = useRef(options.onMessageFromConsumer)
	onMessageFromConsumerRef.current = options.onMessageFromConsumer
	// Stable peer ID that survives React Strict Mode unmount/remount cycles
	const peerIdRef = useRef<PeerId>(generatePeerId())
	const sendLastValueOnConnectAndReconnect =
		options.sendLastValueOnConnectAndReconnect ?? true

	const valueRef = useRef(options.value)
	valueRef.current = options.value
	// Compared by content so an inline object literal does not re-send meta.
	const metaKey = JSON.stringify(options.meta) ?? ''
	const metaRef = useRef(options.meta)
	metaRef.current = options.meta

	useEffect(() => {
		const newProvider = new Host<Meta>(room, {
			onMessage: (value, peerId) => {
				onMessageFromConsumerRef.current?.(value, peerId)
			},
			onPeersChange: (peers) => {
				setPeers(peers)
			},
			onPeerConnected: (peerId) => {
				if (!sendLastValueOnConnectAndReconnect) return
				const v = valueRef.current
				if (v === undefined) return
				newProvider.sendToPeer(peerId, typeof v === 'function' ? v(peerId) : v)
			},
			webSocketSignalingServer: options.webSocketSignalingServer,
			maxClients: options.maxClients,
			browserDirect: options.browserDirect,
			group: options.group,
			meta: metaRef.current,
			peerId: peerIdRef.current,
		})
		setProvider(newProvider)
		setPeers(newProvider.peers)

		return () => {
			newProvider.destroy()
			setProvider(null)
			setPeers([])
		}
	}, [
		room,
		sendLastValueOnConnectAndReconnect,
		options.webSocketSignalingServer,
		options.maxClients,
		options.browserDirect,
		options.group,
	])

	useEffect(() => {
		provider?.setMeta(metaRef.current)
	}, [metaKey, provider])

	useEffect(() => {
		if (options.value === undefined || !provider) return
		if (typeof options.value === 'function') {
			const fn = options.value
			for (const peerId of provider.peers) {
				provider.sendToPeer(peerId, fn(peerId))
			}
		} else {
			provider.send(options.value)
		}
	}, [options.value, provider])

	return { peers, provider }
}
