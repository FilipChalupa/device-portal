import { render, screen, waitFor } from '@testing-library/react'
import { Suspense, useRef } from 'react'
import { describe, expect, test } from 'vitest'
import {
	SuspenseWrapper,
	TestConsumer,
	TestProvider,
	uniqueRoom,
} from './helpers'

describe('Provider-Consumer integration', () => {
	test('consumer receives value from provider', async () => {
		const room = uniqueRoom()

		render(
			<>
				<TestProvider room={room} value="hello" />
				<SuspenseWrapper>
					<TestConsumer room={room} />
				</SuspenseWrapper>
			</>,
		)

		expect(screen.getByTestId('loading')).toBeInTheDocument()

		await waitFor(() => {
			expect(screen.getByTestId('consumer-value')).toHaveTextContent('hello')
		})
	})

	test('consumer updates when provider changes value', async () => {
		const room = uniqueRoom()

		const { rerender } = render(
			<>
				<TestProvider room={room} value="first" />
				<SuspenseWrapper>
					<TestConsumer room={room} />
				</SuspenseWrapper>
			</>,
		)

		await waitFor(() => {
			expect(screen.getByTestId('consumer-value')).toHaveTextContent('first')
		})

		rerender(
			<>
				<TestProvider room={room} value="second" />
				<SuspenseWrapper>
					<TestConsumer room={room} />
				</SuspenseWrapper>
			</>,
		)

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

		render(<TestApp />)

		await waitFor(() => {
			expect(screen.getByTestId('consumer-value')).toHaveTextContent('init')
		})

		screen.getByTestId('send-btn').click()

		await waitFor(() => {
			expect(receivedMessages).toContain('ping')
		})
	})

	test('multiple consumers receive same value', async () => {
		const room = uniqueRoom()

		function Consumer2({ room }: { room: string }) {
			const {
				useDevicePortalConsumer,
			} = require('../consumer/useDevicePortalConsumer')
			const { value } = useDevicePortalConsumer(room, {
				webSocketSignalingServer: null,
				browserDirect: 'same-window-only' as const,
			})
			return <span data-testid="consumer-value-2">{value}</span>
		}

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

		await waitFor(() => {
			expect(screen.getByTestId('consumer-value')).toHaveTextContent('shared')
		})

		await waitFor(() => {
			expect(screen.getByTestId('consumer-value-2')).toHaveTextContent('shared')
		})
	})
})
