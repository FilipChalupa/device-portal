import { GroupRoom, GroupRoomsMessageSchema } from './constants'
import { delay } from './delay'
import { settings } from './settings'
import { getExponentialBackoffDelay } from './utilities/backoff'

export type GroupOptions = {
	/** Defaults to the public example server, like `Host` and `Client`. */
	webSocketSignalingServer?: string
}

export type SubscribeToGroupOptions = GroupOptions & {
	/** Called with the full room list on connect and after every change. */
	onRooms: (rooms: GroupRoom[]) => void
	/**
	 * Called when the subscription socket drops. The subscription reconnects
	 * on its own with exponential backoff and calls `onRooms` again.
	 */
	onDisconnected?: () => void
}

const groupUrl = (serverUrl: string, group: string) =>
	`${serverUrl.replace(/\/+$/, '')}/v0/groups/${encodeURIComponent(group)}`

/**
 * Lists the rooms of a group once. Rooms are listed while at least one
 * signaling connection is open in them and their host joined with `group`.
 */
export async function fetchGroupRooms(
	group: string,
	options: GroupOptions = {},
): Promise<GroupRoom[]> {
	const serverUrl =
		options.webSocketSignalingServer ??
		settings.default.webSocketSignalingServer
	const url = groupUrl(serverUrl, group).replace(/^ws(s?):/, 'http$1:')
	const response = await fetch(url)
	if (!response.ok) {
		throw new Error(
			`Failed to fetch rooms of group "${group}": ${response.status}`,
		)
	}
	const result = GroupRoomsMessageSchema.omit({ type: true }).safeParse(
		await response.json(),
	)
	if (!result.success) {
		throw new Error(`Invalid group rooms response: ${result.error.message}`)
	}
	return result.data.rooms
}

/**
 * Subscribes to the live room list of a group over a WebSocket. Returns the
 * unsubscribe function.
 */
export function subscribeToGroup(
	group: string,
	options: SubscribeToGroupOptions,
): () => void {
	const serverUrl =
		options.webSocketSignalingServer ??
		settings.default.webSocketSignalingServer
	const url = groupUrl(serverUrl, group)
	let socket: WebSocket | null = null
	let reconnectAttempts = 0
	let isDestroyed = false

	const connect = () => {
		if (isDestroyed) {
			return
		}
		socket = new WebSocket(url)
		socket.onopen = () => {
			console.log(`[Group] Subscribed to group: ${group}`)
			reconnectAttempts = 0
		}
		socket.onmessage = (event) => {
			let data: unknown
			try {
				data = JSON.parse(event.data)
			} catch {
				return
			}
			const result = GroupRoomsMessageSchema.safeParse(data)
			if (!result.success) {
				console.error('[Group] Invalid message:', result.error)
				return
			}
			options.onRooms(result.data.rooms)
		}
		socket.onerror = (error) => {
			console.error('[Group] Error:', error)
		}
		socket.onclose = async () => {
			socket = null
			if (isDestroyed) {
				return
			}
			console.log(`[Group] Disconnected from group: ${group}`)
			options.onDisconnected?.()
			await delay(getExponentialBackoffDelay(reconnectAttempts++))
			connect()
		}
	}

	connect()

	return () => {
		isDestroyed = true
		const current = socket
		socket = null
		if (!current) {
			return
		}
		if (current.readyState === WebSocket.CONNECTING) {
			current.onopen = () => current.close()
		} else {
			current.close()
		}
	}
}
