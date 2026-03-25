import { act, render, screen, waitFor } from '@testing-library/react'
import { Suspense, useRef } from 'react'
import { describe, expect, test } from 'vitest'
import {
	SuspenseWrapper,
	TestConsumer,
	TestProvider,
	uniqueRoom,
} from './helpers'
import { useDevicePortalConsumer } from '../consumer/useDevicePortalConsumer'
import { directOnlyOptions } from './helpers'

describe('Provider-Consumer integration', () => {
	test('consumer receives value from provider', async () => {
		const room = uniqueRoom()

		await act(async () => {
			render(
				<>
					<TestProvider room={room} value="hello" />
					<SuspenseWrapper>
						<TestConsumer room={room} />
					</SuspenseWrapper>
				</>,
			)
		})

		await waitFor(() => {
			expect(screen.getByTestId('consumer-value')).toHaveTextContent('hello')
		})
	})

	test('consumer updates when provider changes value', async () => {
		const room = uniqueRoom()

		let rerender: ReturnType<typeof render>['rerender']
		await act(async () => {
			const result = render(
				<>
					<TestProvider room={room} value="first" />
					<SuspenseWrapper>
						<TestConsumer room={room} />
					</SuspenseWrapper>
				</>,
			)
			rerender = result.rerender
		})

		await waitFor(() => {
			expect(screen.getByTestId('consumer-value')).toHaveTextContent('first')
		})

		await act(async () => {
			rerender(
				<>
					<TestProvider room={room} value="second" />
					<SuspenseWrapper>
						<TestConsumer room={room} />
					</SuspenseWrapper>
				</>,
			)
		})

		await waitFor(() => {
			expect(screen.getByTestId('consumer-value')).toHaveTextContent('second')
		})
	})

	test('consumer sends message back to provider', async () => {
		const room = uniqueRoom()
		const receivedMessages: string[] = []

		function TestApp() {
			const sendRef = useRef<((msg: string) => void) | null>(null)
			return (
				<>
					<TestProvider
						room={room}
						value="init"
						onMessageFromConsumer={(msg) => receivedMessages.push(msg)}
					/>
					<SuspenseWrapper>
						<TestConsumer room={room} onSendRef={sendRef} />
					</SuspenseWrapper>
					<button
						data-testid="send-btn"
						onClick={() => sendRef.current?.('ping')}
					/>
				</>
			)
		}

		await act(async () => {
			render(<TestApp />)
		})

		await waitFor(() => {
			expect(screen.getByTestId('consumer-value')).toHaveTextContent('init')
		})

		await act(async () => {
			screen.getByTestId('send-btn').click()
		})

		await waitFor(() => {
			expect(receivedMessages).toContain('ping')
		})
	})

	test('multiple consumers receive same value', async () => {
		const room = uniqueRoom()

		function Consumer2({ room }: { room: string }) {
			const { value } = useDevicePortalConsumer(room, {
				webSocketSignalingServer: null,
				browserDirect: 'same-window-only' as const,
			})
			return <span data-testid="consumer-value-2">{value}</span>
		}

		await act(async () => {
			render(
				<>
					<TestProvider room={room} value="shared" maxClients={2} />
					<SuspenseWrapper>
						<TestConsumer room={room} />
					</SuspenseWrapper>
					<Suspense fallback={<div data-testid="loading-2">Loading</div>}>
						<Consumer2 room={room} />
					</Suspense>
				</>,
			)
		})

		await waitFor(() => {
			expect(screen.getByTestId('consumer-value')).toHaveTextContent('shared')
		})

		await waitFor(() => {
			expect(screen.getByTestId('consumer-value-2')).toHaveTextContent('shared')
		})
	})
})
