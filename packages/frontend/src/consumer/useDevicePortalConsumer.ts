import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { Responder } from '../webrtc/Responder'

// @TODO: warn if one room is used by multiple useDevicePortalConsumer hooks more than once at the same time

type State = {
	room: string
	value: string
	sendValueToProvider: (value: string) => void
}

const responders: {
	[room: string]: {
		responder: Responder
		firstValuePromise: Promise<string>
		consumer: null | {
			value: string
			sendValueToProvider: (value: string) => void
		}
		setValueStates: Set<Dispatch<SetStateAction<State | null>>>
	}
} = {}

export const useDevicePortalConsumer = (
	room: string,
	options: {
		websocketSignalingServer?: string
	} = {},
): Pick<State, 'value' | 'sendValueToProvider'> => {
	const [valueState, setValueState] = useState<State | null>(null)

	const currentConsumer = useMemo(() => {
		if (!responders[room]) {
			console.log(
				`[useDevicePortalConsumer] Creating new Responder for room: ${room}`,
			)
			const withResolvers = () => {
				let resolve: (value: string) => void
				let reject: (reason?: any) => void
				const promise = new Promise<string>((res, rej) => {
					resolve = res
					reject = rej
				})
				return { promise, resolve: resolve!, reject: reject! }
			}

			const { promise: firstValuePromise, resolve: firstValueResolve } =
				(Promise as any).withResolvers?.() ?? withResolvers()

			const sendValueToProvider = (value: string) => {
				responders[room].responder.send(value)
			}

			const responder = new Responder(room, {
				onMessage: (value, peerId) => {
					const consumer = { value, sendValueToProvider }
					responders[room].consumer = consumer
					for (const setState of responders[room].setValueStates) {
						setState({ room, value, sendValueToProvider })
					}
					firstValueResolve(value)
				},
				sendLastValueOnConnectAndReconnect: false,
				websocketSignalingServer: options.websocketSignalingServer,
			})

			responders[room] = {
				responder,
				firstValuePromise,
				consumer: null,
				setValueStates: new Set(),
			}
		}

		responders[room].setValueStates.add(setValueState)

		return responders[room].consumer
	}, [room, options.websocketSignalingServer, setValueState])

	// Cleanup on unmount (though this hook is currently designed for global persistence)
	// useEffect(() => () => { responders[room]?.setValueStates.delete(setValueState) }, [room, setValueState]);

	if (valueState && valueState.room === room) {
		return {
			value: valueState.value,
			sendValueToProvider: valueState.sendValueToProvider,
		}
	}

	if (currentConsumer) {
		return currentConsumer
	}

	throw responders[room].firstValuePromise
}
