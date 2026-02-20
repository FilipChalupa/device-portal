import type { Meta, StoryObj } from '@storybook/react-vite'
import { FunctionComponent, Suspense, useRef, useState } from 'react'
import './Example.stories.css'
import { useDevicePortalProvider } from './provider/useDevicePortalProvider'
import { useDevicePortalConsumer } from './consumer/useDevicePortalConsumer'

const meta: Meta<FunctionComponent> = {
	title: 'Counter',
} satisfies Meta<FunctionComponent>

export default meta
type Story = StoryObj<typeof meta>

const defaultRoom = 'storybook'

const room =
	localStorage.getItem('room') ||
	prompt('Enter room name', localStorage.getItem('room') || defaultRoom) ||
	defaultRoom
localStorage.setItem('room', room)

const websocketSignalingServer = import.meta.env.DEV
	? 'ws://localhost:8080'
	: 'wss://device-portal.filipchalupa.cz'

const ProviderComponent: FunctionComponent = () => {
	console.log('[ProviderComponent] Rendering')
	const containerRef = useRef<HTMLDivElement>(null)
	const [value, setState] = useState(1)
	useDevicePortalProvider(room, value.toString(), {
		onValueFromConsumer: (value) => {
			if (value === 'roll') {
				containerRef.current?.animate(
					[
						{
							transform: 'rotate(1turn)',
						},
					],
					{
						duration: 1000,
					},
				)
			}
		},
		websocketSignalingServer,
		maxClients: 1,
	})

	return (
		<div ref={containerRef} style={{ display: 'inline-block' }}>
			<p>
				Providing value for room "<b>{room}</b>":
			</p>
			<output>{value}</output>
			<div>
				<button
					type="button"
					onClick={() => {
						setState((previousValue) => previousValue - 1)
					}}
				>
					decrease
				</button>{' '}
				<button
					type="button"
					onClick={() => {
						setState((previousValue) => previousValue + 1)
					}}
				>
					increase
				</button>
			</div>
		</div>
	)
}

const ConsumerComponent: FunctionComponent = () => {
	console.log('[ConsumerComponent] Rendering')
	const { value, sendValueToProvider } = useDevicePortalConsumer(room, {
		websocketSignalingServer,
	})
	return (
		<div>
			<p>
				Value provided by the provider in room "<b>{room}</b>" is:
			</p>
			<output>{value}</output>
			<div>
				<button
					type="button"
					onClick={() => {
						sendValueToProvider('roll')
					}}
				>
					Do barrel roll
				</button>
			</div>
		</div>
	)
}

export const Provider: Story = {
	render: () => {
		return (
			<div className="wrapper">
				<h1>Counter provider</h1>
				<p>
					Note: This demo requires the signaling server to be running. Run{' '}
					<code>npm run start:server</code> in your terminal.
				</p>
				<ProviderComponent />
			</div>
		)
	},
}

export const Consumer: Story = {
	render: () => {
		return (
			<div className="wrapper">
				<h1>Counter consumer</h1>
				<p>
					Note: This demo requires the signaling server to be running. Run{' '}
					<code>npm run start:server</code> in your terminal.
				</p>
				<Suspense fallback={<p>Connecting…</p>}>
					<ConsumerComponent />
				</Suspense>
			</div>
		)
	},
}
