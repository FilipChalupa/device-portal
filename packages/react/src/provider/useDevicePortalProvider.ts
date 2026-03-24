import {
	Provider,
	generatePeerId,
	type BrowserDirectOption,
	type PeerId,
} from '@device-portal/client'
import { useEffect, useRef, useState } from 'react'

// @TODO: warn if one room is used by multiple useDevicePortalProvider hooks more than once at the same time

/**
 * Configuration options for the Device Portal Provider.
 */
export type DevicePortalProviderOptions = {
	/** The value to share with all connected consumers. */
	value?: string
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
}

/**
 * A React hook that creates a Device Portal room and shares a value with all joining consumers.
 *
 * @param room - The unique room ID.
 * @param options - Provider configuration options.
 * @returns An object containing the list of connected peers and the underlying Provider instance.
 */
export const useDevicePortalProvider = (
	room: string,
	options: DevicePortalProviderOptions = {},
) => {
	const [provider, setProvider] = useState<Provider | null>(null)
	const [peers, setPeers] = useState<PeerId[]>([])
	const onMessageFromConsumerRef = useRef(options.onMessageFromConsumer)
	onMessageFromConsumerRef.current = options.onMessageFromConsumer
	// Stable peer ID that survives React Strict Mode unmount/remount cycles
	const peerIdRef = useRef<PeerId>(generatePeerId())
	const lastSentValueRef = useRef<string | undefined>(undefined)
	const sendLastValueOnConnectAndReconnect =
		options.sendLastValueOnConnectAndReconnect ?? true

	useEffect(() => {
		const newProvider = new Provider(room, {
			onMessage: (value, peerId) => {
				onMessageFromConsumerRef.current?.(value, peerId)
			},
			onPeersChange: (peers) => {
				setPeers(peers)
			},
			onPeerConnected: () => {
				if (
					sendLastValueOnConnectAndReconnect &&
					lastSentValueRef.current !== undefined
				) {
					newProvider.send(lastSentValueRef.current)
				}
			},
			webSocketSignalingServer: options.webSocketSignalingServer,
			maxClients: options.maxClients,
			browserDirect: options.browserDirect,
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
	])

	useEffect(() => {
		if (options.value === undefined) {
			return
		}
		lastSentValueRef.current = options.value
		provider?.send(options.value)
	}, [options.value, provider])

	return { peers, provider }
}
