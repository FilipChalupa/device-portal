export const settings = {
	channel: {
		label: 'data',
	},
	webrtcSignalingServer: 'https://webrtc-signaling.deno.dev',
	iceServers: [
		{
			urls: ['stun:stun1.l.google.com:19302', 'stun:stun3.l.google.com:19302'],
		},
	] satisfies Array<RTCIceServer>,
} as const
