import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { Responder } from '@device-portal/client'

export type Serializer<T> = (value: T) => string
export type Deserializer<T> = (value: string) => T

export type DevicePortalConsumerOptions<Value = string, Message = string> = {
	websocketSignalingServer?: string
	serializeMessage?: Serializer<Message>
	deserializeValue?: Deserializer<Value>
}

type State = {
	room: string
	value: string
	sendMessageToProvider: (value: string) => void
}

const responders: {
	[room: string]: {
		responder: Responder
		firstValuePromise: Promise<string>
		consumer: null | {
			value: string
			sendMessageToProvider: (value: string) => void
		}
		setValueStates: Set<Dispatch<SetStateAction<State | null>>>
	}
} = {}

export const useDevicePortalConsumer = <Value = string, Message = string>(
	room: string,
	options: DevicePortalConsumerOptions<Value, Message> = {},
): {
	value: Value
	sendMessageToProvider: (message: Message) => void
} => {
	const [valueState, setValueState] = useState<State | null>(null)

	const currentConsumer = useMemo(() => {
		if (!responders[room]) {
			console.log(
				`[useDevicePortalConsumer] Creating new Responder for room: ${room}`,
			)
			const withResolvers = () => {
				let resolve: (value: string) => void
				let reject: (reason?: any) => void
				const promise = new Promise<string>((res, rej) => {
					resolve = res
					reject = rej
				})
				return { promise, resolve: resolve!, reject: reject! }
			}

			const { promise: firstValuePromise, resolve: firstValueResolve } =
				(Promise as any).withResolvers?.() ?? withResolvers()

			const sendMessageToProvider = (value: string) => {
				responders[room].responder.send(value)
			}

			const responder = new Responder(room, {
				onMessage: (value, peerId) => {
					const consumer = { value, sendMessageToProvider }
					responders[room].consumer = consumer
					for (const setState of responders[room].setValueStates) {
						setState({ room, value, sendMessageToProvider })
					}
					firstValueResolve(value)
				},
				sendLastValueOnConnectAndReconnect: false,
				websocketSignalingServer: options.websocketSignalingServer,
			})

			responders[room] = {
				responder,
				firstValuePromise,
				consumer: null,
				setValueStates: new Set(),
			}
		}

		responders[room].setValueStates.add(setValueState)

		return responders[room].consumer
	}, [room, options.websocketSignalingServer, setValueState])

	const deserializeValue = useMemo(
		() =>
			options.deserializeValue ?? ((value: string) => value as unknown as Value),
		[options.deserializeValue],
	)
	const serializeMessage = useMemo(
		() =>
			options.serializeMessage ??
			((message: Message) => message as unknown as string),
		[options.serializeMessage],
	)

	if (valueState && valueState.room === room) {
		return {
			value: deserializeValue(valueState.value),
			sendMessageToProvider: (message: Message) =>
				valueState.sendMessageToProvider(serializeMessage(message)),
		}
	}

	if (currentConsumer) {
		return {
			value: deserializeValue(currentConsumer.value),
			sendMessageToProvider: (message: Message) =>
				currentConsumer.sendMessageToProvider(serializeMessage(message)),
		}
	}

	throw responders[room].firstValuePromise
}
