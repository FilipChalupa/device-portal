# @device-portal/react

[![NPM](https://img.shields.io/npm/v/@device-portal/react.svg)](https://www.npmjs.com/package/@device-portal/react)

Simple WebRTC data channel for React.

## Install

```bash
npm install @device-portal/react
```

## How to use

It is expected that the package will be used on two different devices. Create for them two separate pages or apps. Let's call them App A and App B. Both apps will be linked by same `room` (e.g. `'my-test-room'`).

### One-way Data Flow

This is the simplest use case where a `Provider` sends data to one or more `Consumer`s.

#### App A (Provider)

The provider app sends a value.

```jsx
import { useDevicePortalProvider } from '@device-portal/react'
import { useState } from 'react'

const AppA = () => {
	const [value, setValue] = useState(0)
	useDevicePortalProvider('my-test-room', {
		value: value.toString(),
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

#### App B (Consumer)

The consumer app receives the value from the provider. Every time the provider's value changes, the consumer will be automatically updated.

```jsx
import { useDevicePortalConsumer } from '@device-portal/react'
import { Suspense } from 'react'

const AppB = () => {
	return (
		<Suspense fallback={<p>Connecting...</p>}>
			<ConsumerComponent />
		</Suspense>
	)
}

const ConsumerComponent = () => {
	const { value } = useDevicePortalConsumer('my-test-room', {
		websocketSignalingServer: 'wss://device-portal.filipchalupa.cz',
	})

	return (
		<>
			<h1>App B</h1>
			<p>Value from provider: {value}</p>
		</>
	)
}
```

### Two-way Communication

You can also send messages from the `Consumer` back to the `Provider`.

#### App A (Provider with message handling)

The provider now also listens for messages from the consumer.

```jsx
import { useDevicePortalProvider } from '@device-portal/react'
import { useState } from 'react'

const AppA = () => {
	const [value, setValue] = useState(0)
	const [messageFromB, setMessageFromB] = useState('')

	useDevicePortalProvider('my-test-room', {
		value: value.toString(),
		onMessageFromConsumer: (message) => {
			setMessageFromB(message)
		},
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
			<p>Last message from App B: {messageFromB}</p>
		</>
	)
}
```

#### App B (Consumer with message sending)

The consumer can now send messages to the provider.

```jsx
import { useDevicePortalConsumer } from '@device-portal/react'
import { Suspense } from 'react'

const AppB = () => {
	return (
		<Suspense fallback={<p>Connecting…</p>}>
			<ConsumerComponent />
		</Suspense>
	)
}

const ConsumerComponent = () => {
	const { value, sendMessageToProvider } =
		useDevicePortalConsumer('my-test-room')

	return (
		<>
			<h1>App B</h1>
			<p>Value from provider: {value}</p>
			<button onClick={() => sendMessageToProvider('Hello from B!')}>
				Send Message to A
			</button>
		</>
	)
}
```

## Resilience

The WebRTC connection is designed to be resilient. If the connection to the signaling server is temporarily lost, any established peer-to-peer connections will remain active. The client will attempt to reconnect to the signaling server in the background to handle any future connection negotiations.

## Development

Run

```sh
npm ci
npm run dev
```
