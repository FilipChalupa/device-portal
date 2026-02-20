import {
	createContext,
	useContext,
	type FunctionComponent,
	type ReactNode,
} from 'react'
import {
	useDevicePortalProvider,
	type DevicePortalProviderOptions,
} from './useDevicePortalProvider'
import { type Initiator } from '../webrtc/Initiator'

type DevicePortalContextValue = {
	activePeers: string[]
	initiator: Initiator | null
}

const DevicePortalContext = createContext<DevicePortalContextValue>({
	activePeers: [],
	initiator: null,
})

export const useDevicePortal = () => useContext(DevicePortalContext)

export const DevicePortalProvider: FunctionComponent<{
	room: string
	data: string
	options?: DevicePortalProviderOptions
	children?: ReactNode
}> = ({ room, data, options, children }) => {
	const value = useDevicePortalProvider(room, data, options)
	return (
		<DevicePortalContext.Provider value={value}>
			{children}
		</DevicePortalContext.Provider>
	)
}
