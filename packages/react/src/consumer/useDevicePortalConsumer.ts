import {
	Consumer,
	generatePeerId,
	type BrowserDirectOption,
	type PeerId,
} from '@device-portal/client'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Configuration options for the Device Portal Consumer.
 */
export type DevicePortalConsumerOptions = {
	/** URL of the signaling server, or null to disable. */
	webSocketSignalingServer?: string | null
	/** Browser direct signaling options. */
	browserDirect?: BrowserDirectOption
	/** Whether to automatically send the last 'send()' value back to the provider on reconnect. Default: false. */
	sendLastValueOnConnectAndReconnect?: boolean
}

/**
 * A React hook that joins a Device Portal room and receives value from the provider.
 *
 * Returns `value: null` until the first value is received from the provider.
 * The Consumer is created and destroyed entirely within `useEffect`,
 * making this hook safe for React Strict Mode and concurrent features.
 *
 * @param room - The unique room ID.
 * @param options - Consumer configuration options.
 */
export const useDevicePortalConsumer = (
	room: string,
	options: DevicePortalConsumerOptions = {},
): {
	value: string | null
	sendMessageToProvider: (message: string) => void
} => {
	const [value, setValue] = useState<string | null>(null)
	// Stable peer ID across Strict Mode remounts
	const peerIdRef = useRef<PeerId>(generatePeerId())
	const consumerRef = useRef<Consumer | null>(null)

	useEffect(() => {
		const consumer = new Consumer(room, {
			onMessage: (v) => {
				setValue(v)
			},
			sendLastValueOnConnectAndReconnect:
				options.sendLastValueOnConnectAndReconnect ?? false,
			webSocketSignalingServer: options.webSocketSignalingServer,
			browserDirect: options.browserDirect,
			peerId: peerIdRef.current,
		})
		consumerRef.current = consumer

		return () => {
			consumerRef.current = null
			consumer.destroy()
		}
	}, [
		room,
		options.webSocketSignalingServer,
		options.browserDirect,
		options.sendLastValueOnConnectAndReconnect,
	])

	const sendMessageToProvider = useCallback((message: string) => {
		consumerRef.current?.send(message)
	}, [])

	return { value, sendMessageToProvider }
}
