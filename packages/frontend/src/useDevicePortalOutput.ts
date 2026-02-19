import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { Responder } from './webrtc/Responder'

// @TODO: warn if one room is used by multiple useDevicePortalOutput hooks more than once at the same time

type State = {
	room: string
	value: string
	sendValueToInput: (value: string) => void
}

const responders: {
	[room: string]: {
		responder: Responder
		firstValuePromise: Promise<string>
		output: null | { value: string; sendValueToInput: (value: string) => void }
		setValueStates: Set<Dispatch<SetStateAction<State | null>>>
	}
} = {}

export const useDevicePortalOutput = (
	room: string,
	options?: {
		websocketSignalingServer?: string
	},
): Pick<State, 'value' | 'sendValueToInput'> => {
	const [valueState, setValueState] = useState<State | null>(null)

	const currentOutput = useMemo(() => {
		if (!responders[room]) {
			console.log(
				`[useDevicePortalOutput] Creating new Responder for room: ${room}`,
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

			const sendValueToInput = (value: string) => {
				responders[room].responder.send(value)
			}

			const responder = new Responder(room, {
				onValue: (value) => {
					const output = { value, sendValueToInput }
					responders[room].output = output
					for (const setState of responders[room].setValueStates) {
						setState({ room, value, sendValueToInput })
					}
					firstValueResolve(value)
				},
				sendLastValueOnConnectAndReconnect: false,
				websocketSignalingServer: options?.websocketSignalingServer,
			})

			responders[room] = {
				responder,
				firstValuePromise,
				output: null,
				setValueStates: new Set(),
			}
		}

		responders[room].setValueStates.add(setValueState)

		return responders[room].output
	}, [room, options?.websocketSignalingServer, setValueState])

	// Cleanup on unmount (though this hook is currently designed for global persistence)
	// useEffect(() => () => { responders[room]?.setValueStates.delete(setValueState) }, [room, setValueState]);

	if (valueState && valueState.room === room) {
		return {
			value: valueState.value,
			sendValueToInput: valueState.sendValueToInput,
		}
	}

	if (currentOutput) {
		return currentOutput
	}

	throw responders[room].firstValuePromise
}
