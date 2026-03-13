import { type FunctionComponent, type ReactNode } from 'react'
import { useDevicePortalConsumer } from './useDevicePortalConsumer'

export const DevicePortalConsumer: FunctionComponent<{
	room: string
	websocketSignalingServer?: string
	localDeviceOnly?: boolean
	children: (data: {
		value: string
		sendMessageToProvider: (message: string) => void
	}) => ReactNode
}> = ({ room, websocketSignalingServer, localDeviceOnly, children }) => {
	const { value, sendMessageToProvider } = useDevicePortalConsumer(room, {
		websocketSignalingServer,
		localDeviceOnly,
	})
	return <>{children({ value, sendMessageToProvider })}</>
}
