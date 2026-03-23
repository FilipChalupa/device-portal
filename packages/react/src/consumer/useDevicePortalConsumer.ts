import { Consumer, type BrowserDirectOption } from '@device-portal/client'
import { useEffect, useId, useRef, useState } from 'react'

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

// Keyed by instance ID so each hook invocation gets its own Consumer.
// Module-level cache is needed to survive React Suspense throws.
const instances: {
	[id: string]: {
		consumer: Consumer
		firstValuePromise: Promise<string>
		state: null | State
		setValue: ((state: State) => void) | null
		room: string
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

function createInstance(
	instanceId: string,
	room: string,
	options: DevicePortalConsumerOptions,
) {
	const { promise: firstValuePromise, resolve: firstValueResolve } =
		withResolvers<string>()

	const sendMessageToProvider = (value: string) => {
		instances[instanceId].consumer.send(value)
	}

	const consumer = new Consumer(room, {
		onMessage: (value) => {
			const state = { value, sendMessageToProvider }
			instances[instanceId].state = state
			firstValueResolve(value)
			instances[instanceId].setValue?.(state)
		},
		sendLastValueOnConnectAndReconnect:
			options.sendLastValueOnConnectAndReconnect ?? false,
		webSocketSignalingServer: options.webSocketSignalingServer,
		browserDirect: options.browserDirect,
	})

	instances[instanceId] = {
		consumer,
		firstValuePromise,
		state: null,
		setValue: null,
		room,
	}
}

function destroyInstance(instanceId: string) {
	const instance = instances[instanceId]
	if (instance) {
		instance.setValue = null
		instance.consumer.destroy()
		delete instances[instanceId]
	}
}

/**
 * A React hook that joins a Device Portal room and receives value from the provider.
 * Each hook invocation creates its own Consumer, so the provider sees each consumer as a separate peer.
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
	const instanceId = useId()
	const [valueState, setValueState] = useState<State | null>(null)
	const destroyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	)

	if (!instances[instanceId]) {
		createInstance(instanceId, room, options)
	}

	useEffect(() => {
		// Cancel any pending destruction from a previous cleanup (React Strict Mode remount)
		if (destroyTimeoutRef.current !== null) {
			clearTimeout(destroyTimeoutRef.current)
			destroyTimeoutRef.current = null
		}

		// If instance exists but was created for a different room, destroy and recreate
		if (instances[instanceId] && instances[instanceId].room !== room) {
			destroyInstance(instanceId)
		}

		if (!instances[instanceId]) {
			createInstance(instanceId, room, options)
		}

		const instance = instances[instanceId]
		instance.setValue = setValueState

		if (instance.state) {
			setValueState(instance.state)
		}

		return () => {
			instance.setValue = null
			setValueState(null)
			// Defer destruction so the instance survives React Strict Mode's
			// unmount-remount cycle. If the effect re-runs (Strict Mode), it
			// cancels this timeout. If the component truly unmounts, the
			// timeout fires and destroys the instance.
			destroyTimeoutRef.current = setTimeout(() => {
				destroyTimeoutRef.current = null
				destroyInstance(instanceId)
			}, 0)
		}
	}, [
		instanceId,
		room,
		options.webSocketSignalingServer,
		options.browserDirect,
		options.sendLastValueOnConnectAndReconnect,
	])

	// 1. If we have local state, use it
	if (valueState) {
		return valueState
	}

	// 2. If the consumer already has a value, use it (handles re-renders after suspension)
	if (instances[instanceId].state) {
		return instances[instanceId].state!
	}

	// 3. Otherwise, suspend on the first value promise
	throw instances[instanceId].firstValuePromise
}
