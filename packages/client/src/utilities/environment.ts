/**
 * WebRTC implementation to use instead of the global one. Outside browsers
 * (Node, Bun) there is no global `RTCPeerConnection`; pass one from a package
 * such as `node-datachannel/polyfill` or `werift`.
 */
export type WebRtcOption = {
	RTCPeerConnection: typeof RTCPeerConnection
}

export const isBrowser = () => typeof window !== 'undefined'

/**
 * Direct browser signaling only makes sense between tabs of one browser, so
 * it is on by default in browsers and off everywhere else.
 */
export const defaultBrowserDirect = () => isBrowser()

export const resolveRTCPeerConnection = (
	webrtc: WebRtcOption | undefined,
): typeof RTCPeerConnection => {
	const implementation =
		webrtc?.RTCPeerConnection ?? globalThis.RTCPeerConnection
	if (implementation === undefined) {
		throw new Error(
			'RTCPeerConnection is not available in this runtime. Pass one via the `webrtc` option, e.g. `{ RTCPeerConnection }` from `node-datachannel/polyfill`.',
		)
	}
	return implementation
}
