# @device-portal/react

[![NPM](https://img.shields.io/npm/v/@device-portal/react.svg)](https://www.npmjs.com/package/@device-portal/react)

Simple WebRTC data channel for React.

## Install

```bash
npm install @device-portal/react
```

## How to use

It is expected that the package will be used on two different devices. Create for them two separate pages or apps. Let's call them App A and App B. Both apps will be linked by same `room` (e.g. `'my-test-room'`).

### App A

The first app will be a value provider or `Provider`.

```jsx
import { useDevicePortalProvider } from '@device-portal/react'

const AppA = () => {
	const [value, setValue] = useState(0)
	useDevicePortalProvider('my-test-room', value.toString(), {
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

The other app will be a value consumer or `Consumer`. Every time provider value in App A changes, the consumer in App B will be automatically updated.

```jsx
import { useDevicePortalConsumer } from '@device-portal/react'

const AppB = () => {
	const { value } = useDevicePortalConsumer('my-test-room', {
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

## Development

Run

```sh
npm ci
npm run dev
```
