import {
	createContext,
	useContext,
	type FunctionComponent,
	type PropsWithChildren,
} from 'react'
import { type Initiator } from '../webrtc/Initiator'
import {
	useDevicePortalProvider,
	type DevicePortalProviderOptions,
} from './useDevicePortalProvider'

type DevicePortalContextValue = {
	peers: string[]
	initiator: Initiator | null
}

const DevicePortalContext = createContext<DevicePortalContextValue>({
	peers: [],
	initiator: null,
})

export const useDevicePortal = () => useContext(DevicePortalContext)

export const DevicePortalProvider: FunctionComponent<
	PropsWithChildren<{
		room: string
		data: string
		options?: DevicePortalProviderOptions
	}>
> = ({ room, data, options, children }) => {
	const value = useDevicePortalProvider(room, data, options)
	return (
		<DevicePortalContext.Provider value={value}>
			{children}
		</DevicePortalContext.Provider>
	)
}
