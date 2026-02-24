export const websocketSignalingServer =
	import.meta.env.VITE_WEBSOCKET_SIGNALING_SERVER ??
	(import.meta.env.DEV
		? 'ws://localhost:8080'
		: 'wss://device-portal.filipchalupa.cz')
