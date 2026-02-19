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
		setValueState: Dispatch<SetStateAction<State>>
	}
} = {}

export const useDevicePortalOutput = (
	room: string,
	options?: {
		websocketSignalingServer?: string
	},
): Pick<State, 'value' | 'sendValueToInput'> => {
	const [valueState, setValueState] = useState<State | null>(null)
	const output = useMemo(() => {
		if (valueState === null || valueState.room !== room) {
			return null
		}
		return {
			value: valueState.value,
			sendValueToInput: valueState.sendValueToInput,
		}
	}, [])

	if (!responders[room]) {
		const { promise: firstValuePromise, resolve: firstValueResolve } =
			Promise.withResolvers<string>()
		const responder = new Responder(room, {
			onValue: (value) => {
				responders[room].output = { value, sendValueToInput }
				responders[room].setValueState({ room, value, sendValueToInput })
				firstValueResolve(value)
			},
			sendLastValueOnConnectAndReconnect: false,
			websocketSignalingServer: options?.websocketSignalingServer,
		})
		const sendValueToInput = (value: string) => {
			responder.send(value)
		}
		responders[room] = {
			responder,
			firstValuePromise,
			output: null,
			setValueState,
		}
	}
	responders[room].setValueState = setValueState

	if (output) {
		return output
	}
	if (responders[room].output) {
		return responders[room].output
	}
	throw responders[room].firstValuePromise
}
