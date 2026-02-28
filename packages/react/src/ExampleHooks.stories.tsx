import type { Meta, StoryObj } from '@storybook/react-vite'
import { FunctionComponent, Suspense, useRef, useState } from 'react'
import { useDevicePortalConsumer } from './consumer/useDevicePortalConsumer'
import './Example.stories.css'
import { useDevicePortalProvider } from './provider/useDevicePortalProvider'
import { getLocalStorageRoom } from './stories/utilities/getLocalStorageRoom'
import { websocketSignalingServer } from './stories/utilities/websocketSignalingServer'

const meta: Meta<FunctionComponent> = {
	title: 'Counter/Hooks',
} satisfies Meta<FunctionComponent>

export default meta
type Story = StoryObj<typeof meta>

const ProviderComponent: FunctionComponent = () => {
	const room = getLocalStorageRoom()
	console.log('[ProviderComponent] Rendering')
	const containerRef = useRef<HTMLDivElement>(null)
	const [value, setState] = useState(1)
	useDevicePortalProvider(room, {
		value: value.toString(),
		onMessageFromConsumer: (value, peerId) => {
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
						setState((previousState) => previousState - 1)
					}}
				>
					decrease
				</button>{' '}
				<button
					type="button"
					onClick={() => {
						setState((previousState) => previousState + 1)
					}}
				>
					increase
				</button>
			</div>
		</div>
	)
}

const ConsumerComponent: FunctionComponent = () => {
	const room = getLocalStorageRoom()
	console.log('[ConsumerComponent] Rendering')
	const { value, sendMessageToProvider } = useDevicePortalConsumer(room, {
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
						sendMessageToProvider('roll')
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
