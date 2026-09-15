// A game host running outside the browser. It lists itself in the same group
// as the Storybook "Lobby" story, so browser players can discover and join it.
//
//   npm run build:client && npm run dev        # signaling server + Storybook
//   npm run example:node-host                  # this script, in another shell
//
// Node has no WebRTC of its own — node-datachannel provides it.
import { Host } from '@device-portal/client'
import { RTCPeerConnection } from 'node-datachannel/polyfill'

const webSocketSignalingServer =
	process.env.SERVER_URL ?? `ws://localhost:${process.env.PORT ?? 8080}`
const room =
	process.env.ROOM ?? `node-${Math.random().toString(36).slice(2, 6)}`
const maxClients = 3

// Same protocol as the Lobby story: players send "+1", the host broadcasts
// the leaderboard as JSON.
const scores = new Map()
const leaderboard = () =>
	JSON.stringify(
		[...scores]
			.map(([peerId, score]) => ({ peerId, score }))
			.sort((a, b) => b.score - a.score),
	)

const host = new Host(room, {
	webSocketSignalingServer,
	webrtc: { RTCPeerConnection },
	group: 'lobby-demo',
	meta: { name: `Node host (${process.platform})` },
	maxClients,
	onPeerConnected: (peerId) => {
		console.log(`Player ${peerId} joined`)
		host.sendToPeer(peerId, leaderboard())
	},
	onPeersChange: (peers) => {
		console.log(`Players: ${peers.length} / ${maxClients}`)
	},
	onMessage: (message, peerId) => {
		if (message !== '+1') {
			return
		}
		scores.set(peerId, (scores.get(peerId) ?? 0) + 1)
		host.send(leaderboard())
	},
})

console.log(
	`Hosting room "${room}" via ${webSocketSignalingServer} — open the Lobby story to join.`,
)

process.on('SIGINT', () => {
	host.destroy()
	process.exit(0)
})
