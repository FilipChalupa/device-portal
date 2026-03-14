import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { Responder } from '@device-portal/client'

type State = {
	room: string
	value: string
	sendMessageToProvider: (value: string) => void
}

/** Polyfill/helper for Promise.withResolvers */
const withResolvers = <T>() => {
	if ((Promise as any).withResolvers) {
		return (Promise as any).withResolvers() as {
			promise: Promise<T>
			resolve: (value: T) => void
			reject: (reason?: any) => void
		}
	}
	let resolve: (value: T) => void
	let reject: (reason?: any) => void
	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve: resolve!, reject: reject! }
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

export const useDevicePortalConsumer = (
	room: string,
	options: {
		websocketSignalingServer?: string
		localDeviceOnly?: boolean
	} = {},
): Pick<State, 'value' | 'sendMessageToProvider'> => {
	const [valueState, setValueState] = useState<State | null>(null)

	useEffect(() => {
		if (!responders[room]) {
			console.log(
				`[useDevicePortalConsumer] Creating new Responder for room: ${room}`,
			)

			const { promise: firstValuePromise, resolve: firstValueResolve } =
				withResolvers<string>()

			const sendMessageToProvider = (value: string) => {
				responders[room].responder.send(value)
			}

			const responder = new Responder(room, {
				onMessage: (value) => {
					const consumer = { value, sendMessageToProvider }
					responders[room].consumer = consumer
					for (const setState of responders[room].setValueStates) {
						setState({ room, value, sendMessageToProvider })
					}
					firstValueResolve(value)
				},
				sendLastValueOnConnectAndReconnect: false,
				websocketSignalingServer: options.websocketSignalingServer,
				localDeviceOnly: options.localDeviceOnly,
			})

			responders[room] = {
				responder,
				firstValuePromise,
				consumer: null,
				setValueStates: new Set(),
			}
		}

		responders[room].setValueStates.add(setValueState)

		// If we already have a consumer value, sync it to the new component's state
		if (responders[room].consumer) {
			const consumer = responders[room].consumer!
			setValueState({
				room,
				value: consumer.value,
				sendMessageToProvider: consumer.sendMessageToProvider,
			})
		}

		return () => {
			responders[room]?.setValueStates.delete(setValueState)
		}
	}, [room, options.websocketSignalingServer, options.localDeviceOnly])

	if (valueState && valueState.room === room) {
		return {
			value: valueState.value,
			sendMessageToProvider: valueState.sendMessageToProvider,
		}
	}

	if (responders[room]?.consumer) {
		return responders[room].consumer!
	}

	if (responders[room] && (responders[room] as any).firstValuePromise) {
		throw responders[room].firstValuePromise
	}

	// First render fallback: suspend while useEffect is pending
	throw withResolvers<string>().promise
}
