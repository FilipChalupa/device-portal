import { type FunctionComponent, type ReactNode } from 'react'
import { useDevicePortalConsumer } from './useDevicePortalConsumer'

export const DevicePortalConsumer: FunctionComponent<{
	room: string
	websocketSignalingServer?: string
	children: (data: {
		value: string
		sendMessageToProvider: (message: string) => void
	}) => ReactNode
}> = ({ room, websocketSignalingServer, children }) => {
	const { value, sendMessageToProvider } = useDevicePortalConsumer(room, {
		websocketSignalingServer,
	})
	return <>{children({ value, sendMessageToProvider })}</>
}
