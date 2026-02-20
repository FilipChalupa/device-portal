# React device portal

[![NPM](https://img.shields.io/npm/v/react-device-portal.svg)](https://www.npmjs.com/package/react-device-portal) ![npm type definitions](https://img.shields.io/npm/types/shared-loading-indicator.svg)

## Install

```bash
npm install react-device-portal
```

## How to use

It is expected that the package will be used on two different devices. Create for them two separate pages or apps. Let's call them App A and App B. Both apps will be linked by same `room` (e.g. `'my-test-room'`).

### App A

The first app will be a value provider or `Input`.

```jsx
const AppA = () => {
	const [value, setValue] = useState(0)
	useDevicePortalInput('my-test-room', value.toString(), {
		websocketSignalingServer: 'wss://device-portal.filipchalupa.cz',
	})

	return (
		<>
			<h1>App A</h1>
			<p>Value: {value}</p>
			<button
				onClick={() => {
					setValue(value + 1)
				}}
			>
				Increment
			</button>
		</>
	)
}
```

### App B

The other app will be a value consumer or `Output`. Every time input value in App A changes, the output in App B will be automatically updated.

```jsx
const AppB = () => {
	const { value } = useDevicePortalOutput('my-test-room', {
		websocketSignalingServer: 'wss://device-portal.filipchalupa.cz',
	})

	return (
		<>
			<h1>App B</h1>
			<p>Value: {value}</p>
		</>
	)
}
```

## Server used for WebRTC signaling

This project includes a WebSocket-based signaling server. To run it, you need to have [Node.js](https://nodejs.org/) installed.

Then, you can run the server with the following command:

```sh
npx @device-portal/server
```

The server will run on `ws://localhost:8080` by default.

## Development

Run

```sh
npm ci
npm run dev
```

and

```sh
npm run storybook
```
