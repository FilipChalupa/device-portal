import {
	Consumer,
	generatePeerId,
	type BrowserDirectOption,
	type PeerId,
} from '@device-portal/client'
import { use, useCallback, useEffect, useId, useRef, useState } from 'react'

/**
 * Configuration options for the Device Portal Consumer.
 */
export type DevicePortalConsumerOptions = {
	/** URL of the signaling server, or null to disable. */
	webSocketSignalingServer?: string | null
	/** Browser direct signaling options. */
	browserDirect?: BrowserDirectOption
	/** Whether to automatically send the last 'send()' value back to the provider on reconnect. Default: false. */
	sendLastMessageOnReconnect?: boolean
}

// ---------------------------------------------------------------------------
// Module-level cache for Consumer entries.
//
// Why module-level? The cache must survive React Suspense throws (which
// discard in-progress render state) and React Strict Mode's synchronous
// unmount/remount cycle.  The entry is keyed by `useId()` which is stable
// across both scenarios.
//
// Cleanup uses a grace-period timeout so that Strict Mode's immediate
// remount can reclaim the entry before it's destroyed.
// ---------------------------------------------------------------------------

type ConsumerEntry = {
	consumer: Consumer
	firstValuePromise: Promise<string>
	latestValue: string | undefined
	lastSentValue: string | undefined
	setValue: ((value: string) => void) | null
	destroyTimer: ReturnType<typeof setTimeout> | null
	room: string
	optionsSnapshot: string
}

const entries = new Map<string, ConsumerEntry>()

function optionsKey(options: DevicePortalConsumerOptions): string {
	return `${options.webSocketSignalingServer ?? ''}\0${options.browserDirect ?? ''}\0${options.sendLastMessageOnReconnect ?? ''}`
}

function getOrCreateEntry(
	key: string,
	room: string,
	peerId: PeerId,
	options: DevicePortalConsumerOptions,
): ConsumerEntry {
	const existing = entries.get(key)
	const newOptionsKey = optionsKey(options)

	if (existing) {
		// Cancel any pending destruction
		if (existing.destroyTimer !== null) {
			clearTimeout(existing.destroyTimer)
			existing.destroyTimer = null
		}
		// Reuse if room + options unchanged
		if (existing.room === room && existing.optionsSnapshot === newOptionsKey) {
			return existing
		}
		// Room/options changed – destroy old entry synchronously
		existing.consumer.destroy()
		entries.delete(key)
	}

	// Create a deferred promise for Suspense via use()
	let resolveFirst!: (value: string) => void
	const firstValuePromise = new Promise<string>((resolve) => {
		resolveFirst = resolve
	})

	const sendLastMessageOnReconnect =
		options.sendLastMessageOnReconnect ?? false

	const entry: ConsumerEntry = {
		consumer: undefined!, // assigned below
		firstValuePromise,
		latestValue: undefined,
		lastSentValue: undefined,
		setValue: null,
		destroyTimer: null,
		room,
		optionsSnapshot: newOptionsKey,
	}

	entry.consumer = new Consumer(room, {
		onMessage: (value) => {
			entry.latestValue = value
			resolveFirst(value)
			entry.setValue?.(value)
		},
		onConnected: () => {
			if (
				sendLastMessageOnReconnect &&
				entry.lastSentValue !== undefined
			) {
				entry.consumer.send(entry.lastSentValue)
			}
		},
		webSocketSignalingServer: options.webSocketSignalingServer,
		browserDirect: options.browserDirect,
		peerId,
	})

	entries.set(key, entry)
	return entry
}

function scheduleDestroy(key: string) {
	const entry = entries.get(key)
	if (!entry || entry.destroyTimer !== null) return

	entry.destroyTimer = setTimeout(() => {
		entry.consumer.destroy()
		entries.delete(key)
	}, 5_000)
}

/**
 * A React hook that joins a Device Portal room and receives values from the
 * provider.  **Suspends** the component until the first value is received —
 * wrap the consumer in a `<Suspense>` boundary.
 *
 * Requires React 19+. Uses `use()` for Suspense integration.
 *
 * Safe under React Strict Mode and concurrent features: the underlying
 * Consumer is cached with a grace-period cleanup so synchronous
 * unmount/remount cycles do not create duplicate connections.
 *
 * @param room - The unique room ID.
 * @param options - Consumer configuration options.
 */
export const useDevicePortalConsumer = (
	room: string,
	options: DevicePortalConsumerOptions = {},
): {
	value: string
	sendMessageToProvider: (message: string) => void
} => {
	const instanceId = useId()
	const peerIdRef = useRef<PeerId>(generatePeerId())

	const entry = getOrCreateEntry(instanceId, room, peerIdRef.current, options)

	// Suspends until the first value arrives (React 19 use() API).
	const firstValue = use(entry.firstValuePromise)

	// After the first value, track subsequent updates via useState.
	const [value, setValue] = useState(() => entry.latestValue ?? firstValue)

	// Wire up the entry's setValue so the Consumer can push updates.
	entry.setValue = setValue

	useEffect(() => {
		const e = getOrCreateEntry(instanceId, room, peerIdRef.current, options)
		e.setValue = setValue

		// Sync in case a value arrived between render and effect commit.
		if (e.latestValue !== undefined) {
			setValue(e.latestValue)
		}

		return () => {
			e.setValue = null
			scheduleDestroy(instanceId)
		}
	}, [
		instanceId,
		room,
		options.webSocketSignalingServer,
		options.browserDirect,
		options.sendLastMessageOnReconnect,
	])

	const sendMessageToProvider = useCallback(
		(message: string) => {
			entry.lastSentValue = message
			entry.consumer.send(message)
		},
		[entry],
	)

	return { value, sendMessageToProvider }
}
