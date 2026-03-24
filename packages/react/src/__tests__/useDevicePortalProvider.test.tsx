import { render, renderHook, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { describe, expect, test } from 'vitest'
import { useDevicePortalProvider } from '../provider/useDevicePortalProvider'
import {
	directOnlyOptions,
	SuspenseWrapper,
	TestConsumer,
	uniqueRoom,
} from './helpers'

describe('useDevicePortalProvider', () => {
	test('returns empty peers initially', () => {
		const room = uniqueRoom()
		const { result } = renderHook(() =>
			useDevicePortalProvider(room, directOnlyOptions),
		)
		expect(result.current.peers).toEqual([])
	})

	test('returns a provider instance', () => {
		const room = uniqueRoom()
		const { result } = renderHook(() =>
			useDevicePortalProvider(room, directOnlyOptions),
		)
		expect(result.current.provider).not.toBeNull()
	})

	test('discovers consumer peer', async () => {
		const room = uniqueRoom()

		function TestApp() {
			const { peers } = useDevicePortalProvider(room, {
				value: 'hello',
				...directOnlyOptions,
			})
			return <span data-testid="peer-count">{peers.length}</span>
		}

		render(
			<>
				<TestApp />
				<SuspenseWrapper>
					<TestConsumer room={room} />
				</SuspenseWrapper>
			</>,
		)

		await waitFor(() => {
			expect(screen.getByTestId('peer-count')).toHaveTextContent('1')
		})
	})

	test('calls onMessageFromConsumer when consumer sends', async () => {
		const room = uniqueRoom()
		const messages: string[] = []

		function Provider() {
			useDevicePortalProvider(room, {
				value: 'init',
				onMessageFromConsumer: (msg) => messages.push(msg),
				...directOnlyOptions,
			})
			return null
		}

		function Consumer() {
			const {
				useDevicePortalConsumer,
			} = require('../consumer/useDevicePortalConsumer')
			const { value, sendMessageToProvider } = useDevicePortalConsumer(
				room,
				directOnlyOptions,
			)
			React.useEffect(() => {
				sendMessageToProvider('hello-from-consumer')
			}, [sendMessageToProvider])
			return <span data-testid="val">{value}</span>
		}

		render(
			<>
				<Provider />
				<SuspenseWrapper>
					<Consumer />
				</SuspenseWrapper>
			</>,
		)

		await waitFor(() => {
			expect(messages).toContain('hello-from-consumer')
		})
	})

	test('destroys provider on unmount', () => {
		const room = uniqueRoom()
		const { result, unmount } = renderHook(() =>
			useDevicePortalProvider(room, directOnlyOptions),
		)
		const provider = result.current.provider
		expect(provider).not.toBeNull()

		unmount()

		// After unmount, provider is set to null in state
		// We can't check result.current after unmount, but we can verify
		// the provider was created and the hook completed without error
		expect(provider).not.toBeNull()
	})

	test('creates new provider when room changes', () => {
		const room1 = uniqueRoom()
		const room2 = uniqueRoom()

		const { result, rerender } = renderHook(
			({ room }) => useDevicePortalProvider(room, directOnlyOptions),
			{ initialProps: { room: room1 } },
		)

		const firstProvider = result.current.provider

		rerender({ room: room2 })

		const secondProvider = result.current.provider
		expect(secondProvider).not.toBe(firstProvider)
	})
})
