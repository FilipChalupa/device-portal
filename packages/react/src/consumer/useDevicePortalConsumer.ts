import { Responder, type BrowserDirectOption } from '@device-portal/client'
import { useEffect, useState } from 'react'

type State = {
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

// Keyed by instance ID so each hook invocation gets its own Responder.
// Module-level cache is needed to survive React Suspense throws.
const instances: {
	[id: string]: {
		responder: Responder
		firstValuePromise: Promise<string>
		consumer: null | State
		setValue: ((state: State) => void) | null
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
 * Each hook invocation creates its own Responder, so the provider sees each consumer as a separate peer.
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
	const [instanceId] = useState(() => crypto.randomUUID())
	const [valueState, setValueState] = useState<State | null>(null)

	if (!instances[instanceId]) {
		const { promise: firstValuePromise, resolve: firstValueResolve } =
			withResolvers<string>()

		const sendMessageToProvider = (value: string) => {
			instances[instanceId].responder.send(value)
		}

		const responder = new Responder(room, {
			onMessage: (value) => {
				const consumer = { value, sendMessageToProvider }
				instances[instanceId].consumer = consumer
				firstValueResolve(value)
				instances[instanceId].setValue?.(consumer)
			},
			sendLastValueOnConnectAndReconnect:
				options.sendLastValueOnConnectAndReconnect ?? false,
			webSocketSignalingServer: options.webSocketSignalingServer,
			browserDirect: options.browserDirect,
		})

		instances[instanceId] = {
			responder,
			firstValuePromise,
			consumer: null,
			setValue: null,
		}
	}

	useEffect(() => {
		const instance = instances[instanceId]
		instance.setValue = setValueState

		if (instance.consumer) {
			setValueState(instance.consumer)
		}

		return () => {
			instance.setValue = null
			instance.responder.destroy()
			delete instances[instanceId]
		}
	}, [instanceId, setValueState])

	// 1. If we have local state, use it
	if (valueState) {
		return valueState
	}

	// 2. If the responder already has a value, use it (handles re-renders after suspension)
	if (instances[instanceId].consumer) {
		return instances[instanceId].consumer!
	}

	// 3. Otherwise, suspend on the first value promise
	throw instances[instanceId].firstValuePromise
}
