export const websocketSignalingServer = import.meta.env.DEV
	? 'ws://localhost:8080'
	: `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`
