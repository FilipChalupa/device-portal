# @device-portal/react

[![NPM](https://img.shields.io/npm/v/@device-portal/react.svg)](https://www.npmjs.com/package/@device-portal/react)

Simple WebRTC data channel for React.

## Install

```bash
npm install @device-portal/react
```

## How to use

It is expected that the package will be used on two different devices. Create for them two separate pages or apps. Let's call them App A and App B. Both apps will be linked by same `room` (e.g. `'my-test-room'`).

> **Note:** The example signaling server `wss://device-portal.filipchalupa.cz` is running on a free instance of render.com, so expect slower startup times if it has been inactive.

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
		<Suspense fallback={<p>Connecting…</p>}>
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

## Data Serialization

By default, all values and messages are treated as strings. You can provide custom serializers and deserializers to work with other data types (like objects, numbers, etc.).

### Example with JSON

#### Provider

```jsx
const { peers, initiator } = useDevicePortalProvider('my-room', {
	value: { count: 42, label: 'Initial' },
	serializeValue: (value) => JSON.stringify(value),
	deserializeMessage: (message) => JSON.parse(message),
	onMessageFromConsumer: (message) => {
		console.log('Received object:', message.text)
	},
})
```

#### Consumer

```jsx
const { value, sendMessageToProvider } = useDevicePortalConsumer('my-room', {
	deserializeValue: (value) => JSON.parse(value),
	serializeMessage: (message) => JSON.stringify(message),
})

// value is now an object: { count: 42, label: 'Initial' }
// sendMessageToProvider({ text: 'Hello!' }) will send a JSON string
```

## Components

In addition to hooks, you can use components.

### DevicePortalProvider

Useful for rendering something for each connected peer.

```jsx
<DevicePortalProvider
	room="my-room"
	value={someState}
	serializeValue={JSON.stringify}
>
	{(Peer, peerId) => (
		<div key={peerId}>
			<p>Peer {peerId} is connected!</p>
			{/* Peer component is a headless component that manages connection to this specific peer */}
			<Peer
				value={individualValueForThisPeer}
				onMessageFromConsumer={(message) => console.log(message)}
			/>
		</div>
	)}
</DevicePortalProvider>
```

### DevicePortalConsumer

A component version of `useDevicePortalConsumer`.

```jsx
<Suspense fallback="Connecting...">
	<DevicePortalConsumer
		room="my-room"
		deserializeValue={JSON.parse}
		serializeMessage={JSON.stringify}
	>
		{({ value, sendMessageToProvider }) => (
			<div>
				<p>Value: {value.count}</p>
				<button onClick={() => sendMessageToProvider({ type: 'PING' })}>
					Ping
				</button>
			</div>
		)}
	</DevicePortalConsumer>
</Suspense>
```

## Resilience

The WebRTC connection is designed to be resilient. If the connection to the signaling server is temporarily lost, any established peer-to-peer connections will remain active. The client will attempt to reconnect to the signaling server in the background to handle any future connection negotiations.

## Development

Run

```sh
npm ci
npm run dev
```
