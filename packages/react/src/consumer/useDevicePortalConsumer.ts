import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { Responder, type BrowserDirectOption } from '@device-portal/client'

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
 * This hook suspends the component until the first value is received.
 *
 * @param room - The unique room ID.
 * @param options - Consumer configuration options.
 * @returns An object containing the current value and a function to send messages back to the provider.
 */
export const useDevicePortalConsumer = (
	room: string,
	options: DevicePortalConsumerOptions = {},
): Pick<State, 'value' | 'sendMessageToProvider'> => {
	const [valueState, setValueState] = useState<State | null>(null)

	// Initialize the responder synchronously if it doesn't exist
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

				// Resolve the suspension promise
				firstValueResolve(value)

				// Only trigger state updates for components that have already mounted
				// components currently suspended will re-render when firstValuePromise resolves
				for (const setState of responders[room].setValueStates) {
					setState({ room, value, sendMessageToProvider })
				}
			},
			sendLastValueOnConnectAndReconnect:
				options.sendLastValueOnConnectAndReconnect ?? false,
			webSocketSignalingServer: options.webSocketSignalingServer,
			browserDirect: options.browserDirect,
		})

		responders[room] = {
			responder,
			firstValuePromise,
			consumer: null,
			setValueStates: new Set(),
		}
	}

	useEffect(() => {
		const roomEntry = responders[room]
		roomEntry.setValueStates.add(setValueState)

		// If we already have a value, sync it immediately on mount
		if (roomEntry.consumer) {
			const consumer = roomEntry.consumer!
			setValueState({
				room,
				value: consumer.value,
				sendMessageToProvider: consumer.sendMessageToProvider,
			})
		}

		return () => {
			roomEntry.setValueStates.delete(setValueState)
		}
	}, [room, setValueState])

	// 1. If we have local state, use it
	if (valueState && valueState.room === room) {
		return {
			value: valueState.value,
			sendMessageToProvider: valueState.sendMessageToProvider,
		}
	}

	// 2. If the shared responder already has a value, use it (handles re-renders after suspension)
	if (responders[room].consumer) {
		return responders[room].consumer!
	}

	// 3. Otherwise, suspend on the first value promise
	throw responders[room].firstValuePromise
}
