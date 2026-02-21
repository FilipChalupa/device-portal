export const websocketSignalingServer = import.meta.env.DEV
	? 'ws://localhost:8080'
	: 'wss://device-portal.filipchalupa.cz'
