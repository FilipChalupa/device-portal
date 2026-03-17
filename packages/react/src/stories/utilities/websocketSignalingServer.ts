export const webSocketSignalingServer = import.meta.env.DEV
	? `ws://localhost:${import.meta.env.VITE_PORT}`
	: `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`
