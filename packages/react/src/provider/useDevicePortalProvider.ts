import {
	Provider,
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
	const providerRef = useRef<Provider | null>(null)
	const destroyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	)

	useEffect(() => {
		// Cancel any pending destruction from a previous cleanup (React Strict Mode remount)
		if (destroyTimeoutRef.current !== null) {
			clearTimeout(destroyTimeoutRef.current)
			destroyTimeoutRef.current = null
		}

		// Reuse existing provider if it matches (Strict Mode remount)
		if (providerRef.current) {
			setProvider(providerRef.current)
			setPeers(providerRef.current.peers)
			return () => {
				const currentProvider = providerRef.current
				destroyTimeoutRef.current = setTimeout(() => {
					destroyTimeoutRef.current = null
					if (currentProvider) {
						currentProvider.destroy()
						providerRef.current = null
						setProvider(null)
						setPeers([])
					}
				}, 0)
			}
		}

		const newProvider = new Provider(room, {
			onMessage: (value, peerId) => {
				onMessageFromConsumerRef.current?.(value, peerId)
			},
			onPeersChange: (peers) => {
				setPeers(peers)
			},
			sendLastValueOnConnectAndReconnect:
				options.sendLastValueOnConnectAndReconnect,
			webSocketSignalingServer: options.webSocketSignalingServer,
			maxClients: options.maxClients,
			browserDirect: options.browserDirect,
		})
		providerRef.current = newProvider
		setProvider(newProvider)
		setPeers(newProvider.peers)

		return () => {
			const currentProvider = providerRef.current
			destroyTimeoutRef.current = setTimeout(() => {
				destroyTimeoutRef.current = null
				if (currentProvider) {
					currentProvider.destroy()
					if (providerRef.current === currentProvider) {
						providerRef.current = null
					}
					setProvider(null)
					setPeers([])
				}
			}, 0)
		}
	}, [
		room,
		options.sendLastValueOnConnectAndReconnect,
		options.webSocketSignalingServer,
		options.maxClients,
		options.browserDirect,
	])

	useEffect(() => {
		if (options.value === undefined) {
			return
		}
		provider?.send(options.value)
	}, [options.value, provider])

	return { peers, provider }
}
