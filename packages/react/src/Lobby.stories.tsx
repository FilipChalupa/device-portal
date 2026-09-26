import type { Meta, StoryObj } from '@storybook/react-vite'
import { FunctionComponent, Suspense, useState } from 'react'
import { useDevicePortalConsumer } from './consumer/useDevicePortalConsumer'
import './Lobby.stories.css'
import { useDevicePortalProvider } from './provider/useDevicePortalProvider'
import { webSocketSignalingServer } from './stories/utilities/websocketSignalingServer'
import { useGroupRooms } from './useGroupRooms'
import type { GroupRoom, PeerId } from '@device-portal/client'

/**
 * Rooms created with a `group` are listed by the signaling server for everyone
 * subscribed to that group — the building block of a public game lobby.
 *
 * The demo is a click race: every host keeps a leaderboard of its players and
 * broadcasts it, players send a `+1` per click.
 */
const group = 'lobby-demo'
const maxPlayers = 3

const meta: Meta<FunctionComponent> = {
	title: 'Lobby',
} satisfies Meta<FunctionComponent>

export default meta
type Story = StoryObj<typeof meta>

type Leaderboard = Array<{ peerId: PeerId; score: number }>

/** The name a host published in `meta`, falling back to the room id. */
const displayName = (room: GroupRoom) =>
	typeof room.meta === 'object' && room.meta !== null && 'name' in room.meta
		? String(room.meta.name)
		: room.room

// Everything goes through the signaling server even between tabs of one
// browser, so the counts in the lobby match what you see on the page.
const browserDirect = false

const HostedGame: FunctionComponent<{
	room: string
	onStop: () => void
}> = ({ room, onStop }) => {
	const [name, setName] = useState(`Game ${room.slice(-4)}`)
	const [scores, setScores] = useState<Record<PeerId, number>>({})
	const { peers } = useDevicePortalProvider(room, {
		value: JSON.stringify(toLeaderboard(scores)),
		onMessageFromConsumer: (_message, peerId) => {
			setScores((previous) => ({
				...previous,
				[peerId]: (previous[peerId] ?? 0) + 1,
			}))
		},
		webSocketSignalingServer,
		browserDirect,
		group,
		meta: { name },
		maxClients: maxPlayers,
	})

	return (
		<div className="lobby-card">
			<label className="lobby-card__name">
				<input
					type="text"
					value={name}
					onChange={(event) => setName(event.target.value)}
				/>
			</label>
			<span>
				{peers.length} / {maxPlayers} players
			</span>
			<span className="lobby-status">room {room}</span>
			<button type="button" onClick={onStop}>
				Stop hosting
			</button>
		</div>
	)
}

function toLeaderboard(scores: Record<PeerId, number>): Leaderboard {
	return Object.entries(scores)
		.map(([peerId, score]) => ({ peerId: peerId as PeerId, score }))
		.sort((a, b) => b.score - a.score)
}

const HostedGames: FunctionComponent = () => {
	const [rooms, setRooms] = useState<string[]>([])

	return (
		<section className="lobby-section">
			<h2>Games you host</h2>
			{rooms.map((room) => (
				<HostedGame
					key={room}
					room={room}
					onStop={() =>
						setRooms((previous) => previous.filter((r) => r !== room))
					}
				/>
			))}
			<div>
				<button
					type="button"
					onClick={() =>
						setRooms((previous) => [
							...previous,
							`game-${Math.random().toString(36).substring(2, 6)}`,
						])
					}
				>
					Host a new game
				</button>
			</div>
		</section>
	)
}

const Play: FunctionComponent<{ room: string; onLeave: () => void }> = ({
	room,
	onLeave,
}) => {
	const { value, connectionStatus, sendMessageToProvider } =
		useDevicePortalConsumer(room, { webSocketSignalingServer, browserDirect })
	const leaderboard: Leaderboard = JSON.parse(value)
	const [myClicks, setMyClicks] = useState(0)

	return (
		<>
			<p className="lobby-status">
				{connectionStatus === 'connected' ? 'Connected' : 'Reconnecting…'} to
				room {room}
			</p>
			<button
				type="button"
				className="lobby-click"
				onClick={() => {
					setMyClicks((previous) => previous + 1)
					sendMessageToProvider('+1')
				}}
			>
				Click! ({myClicks})
			</button>
			<ol className="lobby-scores">
				{leaderboard.length === 0 && <li>No clicks yet — be the first.</li>}
				{leaderboard.map(({ peerId, score }) => (
					<li key={peerId}>
						<span>{peerId.slice(0, 8)}</span>
						<span>{score}</span>
					</li>
				))}
			</ol>
			<div>
				<button type="button" onClick={onLeave}>
					Leave
				</button>
			</div>
		</>
	)
}

const PublicGames: FunctionComponent = () => {
	const { rooms, isConnected } = useGroupRooms(group, {
		webSocketSignalingServer,
	})
	const [joinedRoom, setJoinedRoom] = useState<string | null>(null)

	if (joinedRoom !== null) {
		return (
			<section className="lobby-section">
				<h2>Playing</h2>
				<Suspense fallback={<p>Waiting for the host…</p>}>
					<Play room={joinedRoom} onLeave={() => setJoinedRoom(null)} />
				</Suspense>
			</section>
		)
	}

	return (
		<section className="lobby-section">
			<h2>Public games</h2>
			<p className="lobby-status">
				{isConnected ? 'Live list' : 'Connecting to the lobby…'}
			</p>
			{rooms !== null && rooms.length === 0 && (
				<p>No games right now — host one above or in another tab.</p>
			)}
			{rooms?.map((listedRoom) => {
				const isFull =
					listedRoom.maxClients !== undefined &&
					listedRoom.clients >= listedRoom.maxClients
				return (
					<div
						key={listedRoom.room}
						className={`lobby-card${isFull ? ' lobby-card--full' : ''}`}
					>
						<span className="lobby-card__name">{displayName(listedRoom)}</span>
						<span>
							{listedRoom.clients}
							{listedRoom.maxClients !== undefined &&
								` / ${listedRoom.maxClients}`}{' '}
							players
						</span>
						<span className="lobby-status">room {listedRoom.room}</span>
						<button
							type="button"
							disabled={isFull}
							onClick={() => setJoinedRoom(listedRoom.room)}
						>
							{isFull ? 'Full' : 'Join'}
						</button>
					</div>
				)
			})}
		</section>
	)
}

/**
 * Host games and browse the lobby on one page. Open the story in more tabs
 * or devices — every tab sees the same list and can join any game.
 *
 * Hosts do not have to be browsers: `npm run example:node-host` starts a
 * Node process that hosts a game in this very lobby.
 */
export const Playground: Story = {
	render: () => (
		<div className="lobby">
			<h1>Click race lobby</h1>
			<HostedGames />
			<PublicGames />
		</div>
	),
}

/** Only the hosting half — for a device that runs the games. */
export const Host: Story = {
	render: () => (
		<div className="lobby">
			<h1>Click race — host</h1>
			<HostedGames />
		</div>
	),
}

/** Only the lobby half — for a device that joins games. */
export const Browser: Story = {
	render: () => (
		<div className="lobby">
			<h1>Click race — lobby</h1>
			<PublicGames />
		</div>
	),
}
