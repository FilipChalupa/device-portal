import { type FunctionComponent } from 'react'
import { useDevicePortalInput } from './useDevicePortalInput'

export const DevicePortalInput: FunctionComponent<{
	room: string
	data: string
	websocketSignalingServer?: string
}> = ({ room, data, websocketSignalingServer }) => {
	useDevicePortalInput(room, data, { websocketSignalingServer })
	return null
}
