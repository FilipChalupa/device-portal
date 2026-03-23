import { type BrowserDirectOption } from '@device-portal/client'
import { type FunctionComponent, type ReactNode } from 'react'
import { useDevicePortalConsumer } from './useDevicePortalConsumer'

export const DevicePortalConsumer: FunctionComponent<{
	room: string
	webSocketSignalingServer?: string | null
	browserDirect?: BrowserDirectOption
	children: (data: {
		value: string | null
		sendMessageToProvider: (message: string) => void
	}) => ReactNode
}> = ({ room, webSocketSignalingServer, browserDirect, children }) => {
	const { value, sendMessageToProvider } = useDevicePortalConsumer(room, {
		webSocketSignalingServer,
		browserDirect,
	})
	return <>{children({ value, sendMessageToProvider })}</>
}
