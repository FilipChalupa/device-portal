import type { Meta, StoryObj } from '@storybook/react-vite'
import { FunctionComponent, Suspense, useState } from 'react'
import { DevicePortalConsumer } from './consumer/DevicePortalConsumer'
import { useDevicePortalProvider } from './provider/useDevicePortalProvider'
import { webSocketSignalingServer } from './stories/utilities/websocketSignalingServer'
import { useGroupRooms } from './useGroupRooms'

/**
 * Rooms created with a `group` are listed by the signaling server for everyone
 * subscribed to that group — the building block of a public game lobby.
 */
const group = 'lobby-demo'

const meta: Meta<FunctionComponent> = {
	title: 'Lobby',
} satisfies Meta<FunctionComponent>

export default meta
type Story = StoryObj<typeof meta>

const HostEntrypoint: FunctionComponent = () => {
	const [room] = useState(`game-${Math.random().toString(36).substring(2, 6)}`)
	const [name, setName] = useState('My game')
	const { peers } = useDevicePortalProvider(room, {
		value: `Welcome to ${name}`,
		webSocketSignalingServer,
		group,
		meta: { name },
		maxClients: 4,
	})

	return (
		<div>
			<h1>Public game</h1>
			<p>
				Room "<b>{room}</b>" is listed in group "<b>{group}</b>". Open the
				Browser story in another tab to see it.
			</p>
			<label>
				Game name:{' '}
				<input
					type="text"
					value={name}
					onChange={(event) => setName(event.target.value)}
				/>
			</label>
			<p>Connected players: {peers.length} / 4</p>
		</div>
	)
}

const BrowserEntrypoint: FunctionComponent = () => {
	const { rooms, isConnected } = useGroupRooms(group, {
		webSocketSignalingServer,
	})
	const [joinedRoom, setJoinedRoom] = useState<string | null>(null)

	if (joinedRoom !== null) {
		return (
			<div>
				<h1>Joined "{joinedRoom}"</h1>
				<Suspense fallback={<p>Connecting…</p>}>
					<DevicePortalConsumer
						room={joinedRoom}
						webSocketSignalingServer={webSocketSignalingServer}
					>
						{({ value }) => <p>Host says: {value}</p>}
					</DevicePortalConsumer>
				</Suspense>
				<button type="button" onClick={() => setJoinedRoom(null)}>
					Leave
				</button>
			</div>
		)
	}

	return (
		<div>
			<h1>Public games</h1>
			<p>{isConnected ? 'Live' : 'Connecting to the lobby…'}</p>
			{rooms !== null && rooms.length === 0 && (
				<p>No games right now. Start one with the Host story.</p>
			)}
			<ul>
				{rooms?.map((listedRoom) => {
					const name =
						typeof listedRoom.meta === 'object' &&
						listedRoom.meta !== null &&
						'name' in listedRoom.meta
							? String(listedRoom.meta.name)
							: listedRoom.room
					const isFull =
						listedRoom.maxClients !== undefined &&
						listedRoom.clients >= listedRoom.maxClients
					return (
						<li key={listedRoom.room}>
							<b>{name}</b> — {listedRoom.clients}
							{listedRoom.maxClients !== undefined &&
								` / ${listedRoom.maxClients}`}{' '}
							players{' '}
							<button
								type="button"
								disabled={isFull}
								onClick={() => setJoinedRoom(listedRoom.room)}
							>
								{isFull ? 'Full' : 'Join'}
							</button>
						</li>
					)
				})}
			</ul>
		</div>
	)
}

export const Host: Story = {
	render: () => <HostEntrypoint />,
}

export const Browser: Story = {
	render: () => <BrowserEntrypoint />,
}
