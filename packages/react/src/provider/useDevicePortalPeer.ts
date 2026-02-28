import { useEffect, useMemo, useRef } from 'react'
import { Initiator, type PeerId } from '@device-portal/client'
import type { Deserializer, Serializer } from '../consumer/useDevicePortalConsumer'

export type PeerOptions<Value = string, Message = string> = {
	value?: Value
	onMessageFromConsumer?: (message: Message) => void
	serializeValue?: Serializer<Value>
	deserializeMessage?: Deserializer<Message>
}

export const useDevicePortalPeer = <Value = string, Message = string>(
	initiator: Initiator,
	peerId: PeerId,
	options: PeerOptions<Value, Message> = {},
) => {
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
		const unsubscribe = initiator.addPeerListener(peerId, (value) => {
			onMessageFromConsumerRef.current?.(deserializeMessage(value))
		})

		return unsubscribe
	}, [initiator, peerId, deserializeMessage])

	useEffect(() => {
		if (options.value === undefined) {
			return
		}
		initiator.sendToPeer(peerId, serializeValue(options.value))
	}, [initiator, peerId, options.value, serializeValue])
}
