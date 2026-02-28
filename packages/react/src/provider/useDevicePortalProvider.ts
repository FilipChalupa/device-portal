import { useEffect, useMemo, useRef, useState } from 'react'
import { Initiator, type PeerId } from '@device-portal/client'
import type { Deserializer, Serializer } from '../consumer/useDevicePortalConsumer'

// @TODO: warn if one room is used by multiple useDevicePortalProvider hooks more than once at the same time

export type DevicePortalProviderOptions<Value = string, Message = string> = {
	value?: Value
	websocketSignalingServer?: string
	onMessageFromConsumer?: (message: Message, peerId: PeerId) => void
	maxClients?: number
	serializeValue?: Serializer<Value>
	deserializeMessage?: Deserializer<Message>
}

export const useDevicePortalProvider = <Value = string, Message = string>(
	room: string,
	options: DevicePortalProviderOptions<Value, Message> = {},
) => {
	const [initiator, setInitiator] = useState<Initiator | null>(null)
	const [peers, setPeers] = useState<PeerId[]>([])
	const onMessageFromConsumerRef = useRef(options.onMessageFromConsumer)
	onMessageFromConsumerRef.current = options.onMessageFromConsumer

	const deserializeMessage = useMemo(
		() =>
			options.deserializeMessage ??
			((message: string) => message as unknown as Message),
		[options.deserializeMessage],
	)
	const serializeValue = useMemo(
		() =>
			options.serializeValue ?? ((value: Value) => value as unknown as string),
		[options.serializeValue],
	)

	useEffect(() => {
		const initiator = new Initiator(room, {
			onMessage: (value, peerId) => {
				onMessageFromConsumerRef.current?.(deserializeMessage(value), peerId)
			},
			onPeersChange: (peers) => {
				setPeers(peers)
			},
			websocketSignalingServer: options.websocketSignalingServer,
			maxClients: options.maxClients,
		})
		setInitiator(initiator)
		setPeers(initiator.peers)

		return () => {
			initiator.destroy()
			setInitiator(null)
			setPeers([])
		}
	}, [
		room,
		options.websocketSignalingServer,
		options.maxClients,
		deserializeMessage,
	])

	useEffect(() => {
		if (options.value === undefined) {
			return
		}
		initiator?.send(serializeValue(options.value))
	}, [options.value, initiator, serializeValue])

	return { peers, initiator }
}
