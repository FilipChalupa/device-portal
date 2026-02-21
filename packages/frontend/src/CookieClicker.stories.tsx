import type { Meta, StoryObj } from '@storybook/react-vite'
import { FunctionComponent, Suspense, useState } from 'react'
import { DevicePortalConsumer } from './consumer/DevicePortalConsumer'
import './CookieClicker.stories.css'
import { DevicePortalProvider } from './provider/DevicePortalProvider'
import { websocketSignalingServer } from './stories/utilities/websocketSignalingServer'

const meta: Meta<FunctionComponent> = {
	title: 'CookieClicker',
} satisfies Meta<FunctionComponent>

export default meta
type Story = StoryObj<typeof meta>

const ServerEntrypoint: FunctionComponent = () => {
	const [room] = useState(
		`cookie-${Math.random().toString(36).substring(2, 6)}`,
	)
	const [counter, setCounter] = useState(0)

	return (
		<div>
			<h1>Cookie Clicker Server</h1>
			<p>
				Room name: <input readOnly value={room} />
			</p>
			Total click: <output>{counter}</output>
			<DevicePortalProvider
				room={room}
				value={counter.toString()}
				onMessageFromConsumer={(message) => {
					setCounter((previous) => previous + parseInt(message, 10))
				}}
				websocketSignalingServer={websocketSignalingServer}
				maxClients={5}
			/>
		</div>
	)
}

const ClientEntrypoint: FunctionComponent = () => {
	const [room, setRoom] = useState('')
	const [isStarted, setIsStarted] = useState(false)
	const [localCount, setLocalCount] = useState(0)
	const [step, setStep] = useState(1)

	const upgradePrice = Math.ceil(Math.pow(2, step) * 5)

	return (
		<>
			<h1>Cookie Clicker Client</h1>
			<form
				onSubmit={(event) => {
					event.preventDefault()
					setIsStarted(true)
				}}
			>
				<label>
					Room:{' '}
					<input
						type="text"
						value={room}
						onChange={(event) => {
							setRoom(event.target.value)
						}}
						required
						min={1}
						readOnly={isStarted}
					/>
				</label>{' '}
				<button type="submit" disabled={isStarted}>
					Connect
				</button>
			</form>
			{isStarted && (
				<Suspense fallback={<p>Connecting…</p>}>
					<DevicePortalConsumer
						room={room}
						websocketSignalingServer={websocketSignalingServer}
					>
						{({ value: sharedCountString, sendValueToProvider }) => {
							const sharedCount = parseInt(sharedCountString, 10) || 0
							const percentage =
								sharedCount > 0
									? ((localCount / sharedCount) * 100).toFixed(2)
									: 0

							return (
								<div>
									<p>Shared clicks: {sharedCount}</p>
									<p>My clicks: {localCount}</p>
									<p>My contribution: {percentage}%</p>
									<p>Power: {step}×</p>
									<button
										type="button"
										onClick={() => {
											setLocalCount((previous) => previous + step)
											sendValueToProvider(step.toString())
										}}
									>
										Click me!
									</button>{' '}
									<button
										type="button"
										onClick={() => {
											setLocalCount((previous) => previous - upgradePrice)
											setStep((previous) => previous + 1)
										}}
										disabled={localCount < upgradePrice}
									>
										Upgrade
									</button>
								</div>
							)
						}}
					</DevicePortalConsumer>
				</Suspense>
			)}
		</>
	)
}

export const Server: Story = {
	render: () => {
		return (
			<div className="wrapper">
				<ServerEntrypoint />
			</div>
		)
	},
}

export const Client: Story = {
	render: () => {
		return (
			<div className="wrapper">
				<ClientEntrypoint />
			</div>
		)
	},
}
