export const settings = {
	channel: {
		label: 'data',
	},
	default: {
		webSocketSignalingServer: 'wss://device-portal.filipchalupa.cz',
		iceServers: [
			{
				urls: [
					'stun:stun1.l.google.com:19302',
					'stun:stun3.l.google.com:19302',
				],
			},
		] satisfies Array<RTCIceServer>,
	},
} as const
