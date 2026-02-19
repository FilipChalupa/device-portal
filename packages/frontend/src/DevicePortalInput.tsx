import { type FunctionComponent } from 'react'
import { useDevicePortalInput } from './useDevicePortalInput'

export const DevicePortalInput: FunctionComponent<{
	room: string
	data: string
}> = ({ room, data }) => {
	useDevicePortalInput(room, data)
	return null
}
