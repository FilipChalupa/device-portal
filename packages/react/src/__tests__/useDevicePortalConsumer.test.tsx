import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { useDevicePortalConsumer } from '../consumer/useDevicePortalConsumer'
import { useDevicePortalProvider } from '../provider/useDevicePortalProvider'
import { directOnlyOptions, SuspenseWrapper, uniqueRoom } from './helpers'

describe('useDevicePortalConsumer', () => {
	test('shows Suspense fallback before first value', () => {
		const room = uniqueRoom()

		function Consumer() {
			const { value } = useDevicePortalConsumer(room, directOnlyOptions)
			return <span data-testid="consumer-value">{value}</span>
		}

		// Render consumer without a provider — it will suspend indefinitely
		render(
			<SuspenseWrapper>
				<Consumer />
			</SuspenseWrapper>,
		)

		expect(screen.getByTestId('loading')).toBeInTheDocument()
		expect(screen.queryByTestId('consumer-value')).not.toBeInTheDocument()
	})

	test('resolves with first value from provider', async () => {
		const room = uniqueRoom()

		function Provider() {
			useDevicePortalProvider(room, {
				value: 'first-value',
				...directOnlyOptions,
			})
			return null
		}

		function Consumer() {
			const { value } = useDevicePortalConsumer(room, directOnlyOptions)
			return <span data-testid="consumer-value">{value}</span>
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
			expect(screen.getByTestId('consumer-value')).toHaveTextContent(
				'first-value',
			)
		})
	})

	test('updates on subsequent provider values', async () => {
		const room = uniqueRoom()

		function Provider({ value }: { value: string }) {
			useDevicePortalProvider(room, { value, ...directOnlyOptions })
			return null
		}

		function Consumer() {
			const { value } = useDevicePortalConsumer(room, directOnlyOptions)
			return <span data-testid="consumer-value">{value}</span>
		}

		const { rerender } = render(
			<>
				<Provider value="a" />
				<SuspenseWrapper>
					<Consumer />
				</SuspenseWrapper>
			</>,
		)

		await waitFor(() => {
			expect(screen.getByTestId('consumer-value')).toHaveTextContent('a')
		})

		rerender(
			<>
				<Provider value="b" />
				<SuspenseWrapper>
					<Consumer />
				</SuspenseWrapper>
			</>,
		)

		await waitFor(() => {
			expect(screen.getByTestId('consumer-value')).toHaveTextContent('b')
		})
	})

	test('sendMessageToProvider delivers message to provider', async () => {
		const room = uniqueRoom()
		const messages: string[] = []

		function Provider() {
			useDevicePortalProvider(room, {
				value: 'start',
				onMessageFromConsumer: (msg) => messages.push(msg),
				...directOnlyOptions,
			})
			return null
		}

		function Consumer() {
			const { value, sendMessageToProvider } = useDevicePortalConsumer(
				room,
				directOnlyOptions,
			)
			return (
				<>
					<span data-testid="consumer-value">{value}</span>
					<button
						data-testid="send"
						onClick={() => sendMessageToProvider('test-msg')}
					/>
				</>
			)
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
			expect(screen.getByTestId('consumer-value')).toHaveTextContent('start')
		})

		screen.getByTestId('send').click()

		await waitFor(() => {
			expect(messages).toContain('test-msg')
		})
	})
})
