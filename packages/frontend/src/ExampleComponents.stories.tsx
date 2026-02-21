import type { Meta, StoryObj } from '@storybook/react-vite'
import {
	FunctionComponent,
	Suspense,
	useRef,
	useState,
	type ReactNode,
} from 'react'
import { DevicePortalConsumer } from './consumer/DevicePortalConsumer'
import './Example.stories.css'
import { DevicePortalProvider } from './provider/DevicePortalProvider'
import { websocketSignalingServer } from './stories/utilities/websocketSignalingServer'
import type { PeerId } from './webrtc/PeerId'

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

const ProviderComponent: FunctionComponent = () => {
	console.log('[ProviderComponent] Rendering')
	const containerRef = useRef<HTMLDivElement>(null)

	return (
		<div ref={containerRef} style={{ display: 'inline-block' }}>
			<p>
				Providing value for room "<b>{room}</b>".
			</p>
			<div style={{ marginTop: '0.5em', display: 'grid', rowGap: '0.5em' }}>
				<DevicePortalProvider
					room={room}
					websocketSignalingServer={websocketSignalingServer}
					maxClients={5}
					onMessageFromConsumer={(value, peerId) => {
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
				>
					{(Peer, peerId) => (
						<PeerInsideProvider key={peerId} peerId={peerId}>
							{(value: string) => (
								<Peer
									value={value}
									onMessageFromConsumer={(message) => {
										console.log(`Message from peer ${peerId}: ${message}`)
									}}
								/>
							)}
						</PeerInsideProvider>
					)}
				</DevicePortalProvider>
			</div>
		</div>
	)
}

const PeerInsideProvider: FunctionComponent<{
	peerId: PeerId
	children: (value: string) => ReactNode
}> = ({ peerId, children }) => {
	const [random, setRandom] = useState(100)
	return (
		<div style={{ border: '1px solid', padding: '0.5em' }}>
			<p>Connected peer: {peerId}</p>
			<button
				type="button"
				onClick={() => {
					setRandom(Math.floor(Math.random() * 100) + 1)
				}}
			>
				Random
			</button>
			<div>Random value: {random}</div>
			{children(random.toString())}
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
