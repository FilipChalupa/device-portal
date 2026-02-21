import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { Responder } from '../webrtc/Responder'

type State = {
	room: string
	value: string
	sendMessageToProvider: (value: string) => void
}

const responders: {
	[room: string]: {
		responder: Responder
		firstValuePromise: Promise<string>
		consumer: null | {
			value: string
			sendMessageToProvider: (value: string) => void
		}
		setValueStates: Set<Dispatch<SetStateAction<State | null>>>
	}
} = {}

export const useDevicePortalConsumer = (
	room: string,
	options: {
		websocketSignalingServer?: string
	} = {},
): Pick<State, 'value' | 'sendMessageToProvider'> => {
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

			const sendMessageToProvider = (value: string) => {
				responders[room].responder.send(value)
			}

			const responder = new Responder(room, {
				onMessage: (value, peerId) => {
					const consumer = { value, sendMessageToProvider }
					responders[room].consumer = consumer
					for (const setState of responders[room].setValueStates) {
						setState({ room, value, sendMessageToProvider })
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
			sendMessageToProvider: valueState.sendMessageToProvider,
		}
	}

	if (currentConsumer) {
		return currentConsumer
	}

	throw responders[room].firstValuePromise
}
