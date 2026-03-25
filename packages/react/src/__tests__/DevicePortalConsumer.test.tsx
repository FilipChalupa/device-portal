import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { DevicePortalConsumer } from '../consumer/DevicePortalConsumer'
import { useDevicePortalProvider } from '../provider/useDevicePortalProvider'
import { directOnlyOptions, SuspenseWrapper, uniqueRoom } from './helpers'

describe('DevicePortalConsumer', () => {
	test('renders fallback while suspended', () => {
		const room = uniqueRoom()

		render(
			<SuspenseWrapper>
				<DevicePortalConsumer
					room={room}
					webSocketSignalingServer={null}
					browserDirect="same-window-only"
				>
					{({ value }) => <span data-testid="consumer-value">{value}</span>}
				</DevicePortalConsumer>
			</SuspenseWrapper>,
		)

		expect(screen.getByTestId('loading')).toBeInTheDocument()
	})

	test('renders children with value from provider', async () => {
		const room = uniqueRoom()

		function Provider() {
			useDevicePortalProvider(room, {
				value: 'component-test',
				...directOnlyOptions,
			})
			return null
		}

		await act(async () => {
			render(
				<>
					<Provider />
					<SuspenseWrapper>
						<DevicePortalConsumer
							room={room}
							webSocketSignalingServer={null}
							browserDirect="same-window-only"
						>
							{({ value, sendMessageToProvider }) => (
								<>
									<span data-testid="consumer-value">{value}</span>
									<button
										data-testid="send"
										onClick={() => sendMessageToProvider('from-component')}
									/>
								</>
							)}
						</DevicePortalConsumer>
					</SuspenseWrapper>
				</>,
			)
		})

		await waitFor(() => {
			expect(screen.getByTestId('consumer-value')).toHaveTextContent(
				'component-test',
			)
		})
	})
})
