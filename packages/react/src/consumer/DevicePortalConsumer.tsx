import { type ReactNode } from 'react'
import {
	useDevicePortalConsumer,
	type DevicePortalConsumerOptions,
} from './useDevicePortalConsumer'

export const DevicePortalConsumer = <Value = string, Message = string>({
	room,
	children,
	...options
}: {
	room: string
	children: (data: {
		value: Value
		sendMessageToProvider: (message: Message) => void
	}) => ReactNode
} & DevicePortalConsumerOptions<Value, Message>) => {
	const { value, sendMessageToProvider } = useDevicePortalConsumer<
		Value,
		Message
	>(room, options)
	return <>{children({ value, sendMessageToProvider })}</>
}
