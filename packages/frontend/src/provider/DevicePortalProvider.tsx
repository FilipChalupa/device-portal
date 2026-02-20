import { type FunctionComponent } from 'react'
import {
	useDevicePortalProvider,
	type DevicePortalProviderOptions,
} from './useDevicePortalProvider'

export const DevicePortalProvider: FunctionComponent<{
	room: string
	data: string
	options?: DevicePortalProviderOptions
}> = ({ room, data, options }) => {
	useDevicePortalProvider(room, data, options)
	return null
}
