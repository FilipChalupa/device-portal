import type { Meta, StoryObj } from '@storybook/react-vite'
import { FunctionComponent, Suspense, useRef, useState } from 'react'
import './Example.stories.css'
import { useDevicePortalInput } from './useDevicePortalInput'
import { useDevicePortalOutput } from './useDevicePortalOutput'

const meta: Meta<FunctionComponent> = {
	title: 'Demo',
} satisfies Meta<FunctionComponent>

export default meta
type Story = StoryObj<typeof meta>

const room =
	localStorage.getItem('room') ||
	prompt('Enter room name', localStorage.getItem('room') || 'storybook') ||
	'storybook'
localStorage.setItem('room', room)

const websocketSignalingServer = 'ws://localhost:8080'

const InputComponent: FunctionComponent = () => {
	const containerRef = useRef<HTMLDivElement>(null)
	const [value, setState] = useState(1)
	useDevicePortalInput(room, value.toString(), {
		onValueFromOutput: (value) => {
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

const OutputComponent: FunctionComponent = () => {
	const { value, sendValueToInput } = useDevicePortalOutput(room, {
		websocketSignalingServer,
	})
	return (
		<div>
			<p>
				Value provided by the input in room "<b>{room}</b>" is:
			</p>
			<output>{value}</output>
			<div>
				<button
					type="button"
					onClick={() => {
						sendValueToInput('roll')
					}}
				>
					Do barrel roll
				</button>
			</div>
		</div>
	)
}

export const Input: Story = {
	render: () => {
		return (
			<div className="wrapper">
				<h1>Demo input</h1>
				<p>
					Note: This demo requires the signaling server to be running. Run{' '}
					<code>npm run start:server</code> in your terminal.
				</p>
				<InputComponent />
			</div>
		)
	},
}

export const Output: Story = {
	render: () => {
		return (
			<div className="wrapper">
				<h1>Demo output</h1>
				<p>
					Note: This demo requires the signaling server to be running. Run{' '}
					<code>npm run start:server</code> in your terminal.
				</p>
				<Suspense fallback={<p>Connecting…</p>}>
					<OutputComponent />
				</Suspense>
			</div>
		)
	},
}
