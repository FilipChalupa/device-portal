import type { PeerId } from '@device-portal/client'
import React, { Suspense, useEffect } from 'react'
import { useDevicePortalConsumer } from '../consumer/useDevicePortalConsumer'
import { useDevicePortalProvider } from '../provider/useDevicePortalProvider'

export function uniqueRoom(): string {
	return `test-room-${crypto.randomUUID()}`
}

export const directOnlyOptions = {
	webSocketSignalingServer: null as null,
	browserDirect: 'same-window-only' as const,
}

export function TestProvider({
	room,
	value,
	onMessageFromConsumer,
	maxClients,
}: {
	room: string
	value?: string
	onMessageFromConsumer?: (value: string, peerId: PeerId) => void
	maxClients?: number
}) {
	const { peers } = useDevicePortalProvider(room, {
		value,
		onMessageFromConsumer,
		maxClients,
		...directOnlyOptions,
	})
	return (
		<div data-testid="provider">
			<span data-testid="peer-count">{peers.length}</span>
		</div>
	)
}

export function TestConsumer({
	room,
	onSendRef,
}: {
	room: string
	onSendRef?: React.MutableRefObject<((msg: string) => void) | null>
}) {
	const { value, sendMessageToProvider } = useDevicePortalConsumer(room, {
		...directOnlyOptions,
	})

	useEffect(() => {
		if (onSendRef) {
			onSendRef.current = sendMessageToProvider
		}
	}, [sendMessageToProvider, onSendRef])

	return <span data-testid="consumer-value">{value}</span>
}

export function SuspenseWrapper({ children }: { children: React.ReactNode }) {
	return (
		<Suspense fallback={<div data-testid="loading">Loading</div>}>
			{children}
		</Suspense>
	)
}
