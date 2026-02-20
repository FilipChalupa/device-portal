import { type FunctionComponent } from 'react'
import { useDevicePortalProvider } from './useDevicePortalProvider'

export const DevicePortalProvider: FunctionComponent<{
	room: string
	data: string
	websocketSignalingServer?: string
}> = ({ room, data, websocketSignalingServer }) => {
	useDevicePortalProvider(room, data, { websocketSignalingServer })
	return null
}
