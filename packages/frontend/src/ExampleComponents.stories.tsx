import type { Meta, StoryObj } from '@storybook/react-vite'
import { FunctionComponent, Suspense, useRef, useState } from 'react'
import { DevicePortalConsumer } from './consumer/DevicePortalConsumer'
import './Example.stories.css'
import { DevicePortalProvider } from './provider/DevicePortalProvider'

const meta: Meta<FunctionComponent> = {
	title: 'Counter/Components',
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
			<DevicePortalProvider
				room={room}
				data={value.toString()}
				websocketSignalingServer={websocketSignalingServer}
				maxClients={1}
				onValueFromConsumer={(value, peerId) => {
					console.log(
						`[ProviderComponent] Received value from peer ${peerId}: ${value}`,
					)
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
				}}
			/>
		</div>
	)
}

const ConsumerComponent: FunctionComponent = () => {
	console.log('[ConsumerComponent] Rendering')
	return (
		<DevicePortalConsumer
			room={room}
			websocketSignalingServer={websocketSignalingServer}
		>
			{({ value, sendValueToProvider }) => (
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
			)}
		</DevicePortalConsumer>
	)
}

export const Provider: Story = {
	render: () => {
		return (
			<div className="wrapper">
				<h1>Counter provider</h1>
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
				<Suspense fallback={<p>Connecting…</p>}>
					<ConsumerComponent />
				</Suspense>
			</div>
		)
	},
}
