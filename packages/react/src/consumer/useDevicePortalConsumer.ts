import {
	Consumer,
	generatePeerId,
	type BrowserDirectOption,
	type PeerId,
} from '@device-portal/client'
import { useCallback, useEffect, useId, useRef, useSyncExternalStore } from 'react'

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

// ---------------------------------------------------------------------------
// Module-level cache for Consumer entries.
//
// Each entry holds the Consumer instance, a Suspense promise, the latest
// snapshot, and a set of subscribers (used by useSyncExternalStore).
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
	snapshot: string | undefined
	subscribers: Set<() => void>
	destroyTimer: ReturnType<typeof setTimeout> | null
	room: string
	optionsSnapshot: string // JSON-serialisable key for shallow comparison
}

const entries = new Map<string, ConsumerEntry>()

function optionsKey(options: DevicePortalConsumerOptions): string {
	return `${options.webSocketSignalingServer ?? ''}\0${options.browserDirect ?? ''}\0${options.sendLastValueOnConnectAndReconnect ?? ''}`
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

	// Create a deferred promise for Suspense
	let resolveFirst!: (value: string) => void
	const firstValuePromise = new Promise<string>((resolve) => {
		resolveFirst = resolve
	})

	const entry: ConsumerEntry = {
		consumer: undefined!, // assigned below
		firstValuePromise,
		snapshot: undefined,
		subscribers: new Set(),
		destroyTimer: null,
		room,
		optionsSnapshot: newOptionsKey,
	}

	entry.consumer = new Consumer(room, {
		onMessage: (value) => {
			entry.snapshot = value
			resolveFirst(value)
			for (const subscriber of entry.subscribers) {
				subscriber()
			}
		},
		sendLastValueOnConnectAndReconnect:
			options.sendLastValueOnConnectAndReconnect ?? false,
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

	// Grace period – Strict Mode remounts happen synchronously within the
	// same commit, so even a short timeout survives them.
	entry.destroyTimer = setTimeout(() => {
		if (entry.subscribers.size === 0) {
			entry.consumer.destroy()
			entries.delete(key)
		} else {
			entry.destroyTimer = null
		}
	}, 5_000)
}

/**
 * A React hook that joins a Device Portal room and receives values from the
 * provider.  **Suspends** the component until the first value is received —
 * wrap the consumer in a `<Suspense>` boundary.
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
	// Stable peer ID that survives Strict Mode unmount/remount cycles.
	const peerIdRef = useRef<PeerId>(generatePeerId())

	// Idempotent: second render in Strict Mode reuses the cached entry.
	const entry = getOrCreateEntry(instanceId, room, peerIdRef.current, options)

	// Effect ensures the entry stays alive while mounted and schedules
	// cleanup on unmount.  Strict Mode's immediate remount cancels the
	// scheduled destruction inside getOrCreateEntry.
	useEffect(() => {
		getOrCreateEntry(instanceId, room, peerIdRef.current, options)
		return () => {
			scheduleDestroy(instanceId)
		}
	}, [
		instanceId,
		room,
		options.webSocketSignalingServer,
		options.browserDirect,
		options.sendLastValueOnConnectAndReconnect,
	])

	// Subscribe to value updates via React's blessed external-store API.
	const value = useSyncExternalStore(
		useCallback(
			(onStoreChange: () => void) => {
				entry.subscribers.add(onStoreChange)
				return () => {
					entry.subscribers.delete(onStoreChange)
				}
			},
			[entry],
		),
		() => entry.snapshot,
	)

	const sendMessageToProvider = useCallback(
		(message: string) => {
			entry.consumer.send(message)
		},
		[entry],
	)

	// Suspend until the first value arrives.
	if (value === undefined) {
		throw entry.firstValuePromise
	}

	return { value, sendMessageToProvider }
}
