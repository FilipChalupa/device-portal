import type { Meta, StoryObj } from '@storybook/react-vite'
import { FunctionComponent, Suspense, useRef, useState } from 'react'
import { useDevicePortalConsumer } from './consumer/useDevicePortalConsumer'
import './Example.stories.css'
import { useDevicePortalProvider } from './provider/useDevicePortalProvider'
import { getLocalStorageRoom } from './stories/utilities/getLocalStorageRoom'
import { websocketSignalingServer } from './stories/utilities/websocketSignalingServer'

const meta: Meta<FunctionComponent> = {
	title: 'Serialization/Complex State',
} satisfies Meta<FunctionComponent>

export default meta
type Story = StoryObj<typeof meta>

type AppState = {
	count: number
	color: string
}

type Action =
	| { type: 'increment' }
	| { type: 'decrement' }
	| { type: 'setColor'; color: string }

const serializeState = (state: AppState): string => JSON.stringify(state)
const deserializeState = (value: string): AppState => JSON.parse(value)
const serializeAction = (action: Action): string => JSON.stringify(action)
const deserializeAction = (value: string): Action => JSON.parse(value)

const ProviderComponent: FunctionComponent = () => {
	const room = getLocalStorageRoom()
	const containerRef = useRef<HTMLDivElement>(null)
	const [state, setState] = useState<AppState>({ count: 0, color: 'black' })

	useDevicePortalProvider<AppState, Action>(room, {
		value: state,
		serializeValue: serializeState,
		deserializeMessage: deserializeAction,
		onMessageFromConsumer: (action, peerId) => {
			console.log(
				`[ProviderComponent] Received action from peer ${peerId}:`,
				action,
			)
			switch (action.type) {
				case 'increment':
					setState((previousState) => ({
						...previousState,
						count: previousState.count + 1,
					}))
					break
				case 'decrement':
					setState((previousState) => ({
						...previousState,
						count: previousState.count - 1,
					}))
					break
				case 'setColor':
					setState((previousState) => ({
						...previousState,
						color: action.color,
					}))
					break
			}
		},
		websocketSignalingServer,
		maxClients: 1,
	})

	return (
		<div ref={containerRef}>
			<p>
				Providing state for room "<b>{room}</b>":
			</p>
			<div
				style={{
					padding: '20px',
					border: `2px solid ${state.color}`,
					borderRadius: '8px',
					color: state.color,
				}}
			>
				<h2 style={{ margin: 0 }}>Count: {state.count}</h2>
				<p>Color: {state.color}</p>
			</div>
			<div style={{ marginTop: '10px' }}>
				<button
					type="button"
					onClick={() => {
						setState((previousState) => ({
							...previousState,
							count: previousState.count + 1,
						}))
					}}
				>
					Local Increment
				</button>
			</div>
		</div>
	)
}

const ConsumerComponent: FunctionComponent = () => {
	const room = getLocalStorageRoom()
	const { value: state, sendMessageToProvider: sendAction } =
		useDevicePortalConsumer<AppState, Action>(room, {
			deserializeValue: deserializeState,
			serializeMessage: serializeAction,
			websocketSignalingServer,
		})

	return (
		<div>
			<p>
				State in room "<b>{room}</b>":
			</p>
			<div
				style={{
					padding: '20px',
					border: `2px solid ${state.color}`,
					borderRadius: '8px',
					color: state.color,
				}}
			>
				<h2 style={{ margin: 0 }}>Count: {state.count}</h2>
				<p>Color: {state.color}</p>
			</div>
			<div style={{ marginTop: '10px', display: 'flex', gap: '5px' }}>
				<button type="button" onClick={() => sendAction({ type: 'increment' })}>
					Increment
				</button>
				<button type="button" onClick={() => sendAction({ type: 'decrement' })}>
					Decrement
				</button>
				<button
					type="button"
					onClick={() => sendAction({ type: 'setColor', color: 'red' })}
				>
					Red
				</button>
				<button
					type="button"
					onClick={() => sendAction({ type: 'setColor', color: 'blue' })}
				>
					Blue
				</button>
			</div>
		</div>
	)
}

export const Provider: Story = {
	render: () => {
		return (
			<div className="wrapper">
				<h1>Complex State Provider</h1>
				<ProviderComponent />
			</div>
		)
	},
}

export const Consumer: Story = {
	render: () => {
		return (
			<div className="wrapper">
				<h1>Complex State Consumer</h1>
				<Suspense fallback={<p>Connecting…</p>}>
					<ConsumerComponent />
				</Suspense>
			</div>
		)
	},
}
