import type { Meta, StoryObj } from '@storybook/react-vite'
import {
	FunctionComponent,
	Suspense,
	useCallback,
	useState,
	type SubmitEvent,
} from 'react'
import './Chat.stories.css'
import { DevicePortalConsumer } from './consumer/DevicePortalConsumer'
import { DevicePortalProvider } from './provider/DevicePortalProvider'
import { ShareLink } from './stories/ShareLink'
import { webSocketSignalingServer } from './stories/utilities/websocketSignalingServer'

type ChatMessage = {
	id: string
	text: string
	sender: 'provider' | 'consumer'
	timestamp: number
}

const ChatHistory: FunctionComponent<{ messages: ChatMessage[] }> = ({
	messages,
}) => {
	return (
		<div className="chat-messages">
			{messages.length === 0 && <p>No messages yet.</p>}
			{messages.map((message) => (
				<div key={message.id} className={`chat-message ${message.sender}`}>
					<small>{new Date(message.timestamp).toLocaleTimeString()}</small>
					<br />
					<strong>{message.sender}:</strong> {message.text}
				</div>
			))}
		</div>
	)
}

const meta: Meta<FunctionComponent> = {
	title: 'Chat',
} satisfies Meta<FunctionComponent>

export default meta
type Story = StoryObj<typeof meta>

const ServerEntrypoint: FunctionComponent = () => {
	const [room] = useState(`chat-${Math.random().toString(36).substring(2, 6)}`)
	const [messages, setMessages] = useState<ChatMessage[]>([])
	const [inputText, setInputText] = useState('')

	const addMessage = useCallback(
		(text: string, sender: 'provider' | 'consumer') => {
			setMessages((previous) => {
				const newMessage: ChatMessage = {
					id: Math.random().toString(36).substring(2, 9),
					text,
					sender,
					timestamp: Date.now(),
				}
				const nextMessages = [...previous, newMessage]
				return nextMessages.slice(-5)
			})
		},
		[],
	)

	const handleSend = useCallback(
		(event: SubmitEvent) => {
			event.preventDefault()
			if (inputText.trim()) {
				addMessage(inputText, 'provider')
				setInputText('')
			}
		},
		[inputText, addMessage],
	)

	return (
		<div className="chat-wrapper">
			<h1>Chat</h1>
			<div>
				<ShareLink
					room={room}
					title="Join Chat"
					text={`Join my Chat room: ${room}`}
				/>
			</div>

			<ChatHistory messages={messages} />

			<form onSubmit={handleSend} className="chat-input-row">
				<input
					type="text"
					value={inputText}
					onChange={(e) => setInputText(e.target.value)}
					placeholder="Message as provider…"
				/>
				<button type="submit">Send</button>
			</form>

			<DevicePortalProvider
				room={room}
				value={JSON.stringify(messages)}
				onMessageFromConsumer={(text) => {
					addMessage(text, 'consumer')
				}}
				webSocketSignalingServer={webSocketSignalingServer}
				maxClients={10}
			/>

			<div className="local-consumer">
				<h3>Local Consumer (Same Page)</h3>
				<Suspense fallback={<p>Connecting local consumer…</p>}>
					<ClientView room={room} />
				</Suspense>
			</div>
		</div>
	)
}

const ClientView: FunctionComponent<{ room: string }> = ({ room }) => {
	const [inputText, setInputText] = useState('')

	return (
		<DevicePortalConsumer
			room={room}
			webSocketSignalingServer={webSocketSignalingServer}
		>
			{({ value, sendMessageToProvider }) => {
				const messages: ChatMessage[] = value ? JSON.parse(value) : []

				const handleSend = (event: SubmitEvent) => {
					event.preventDefault()
					if (inputText.trim()) {
						sendMessageToProvider(inputText)
						setInputText('')
					}
				}

				return (
					<div className="chat-wrapper" style={{ maxWidth: '100%' }}>
						<ChatHistory messages={messages} />
						<form onSubmit={handleSend} className="chat-input-row">
							<input
								type="text"
								value={inputText}
								onChange={(event) => setInputText(event.target.value)}
								placeholder="Message as consumer…"
							/>
							<button type="submit">Send</button>
						</form>
					</div>
				)
			}}
		</DevicePortalConsumer>
	)
}

const ClientEntrypoint: FunctionComponent = () => {
	const [room, setRoom] = useState(location.hash.slice(1))
	const [isStarted, setIsStarted] = useState(() => room.length > 0)

	return (
		<div className="chat-wrapper">
			<h1>Chat Consumer</h1>
			{!isStarted ? (
				<form
					onSubmit={(event) => {
						event.preventDefault()
						setIsStarted(true)
					}}
				>
					<label>
						Room:{' '}
						<input
							type="text"
							value={room}
							onChange={(event) => {
								setRoom(event.target.value)
							}}
							required
							min={1}
							readOnly={isStarted}
						/>
					</label>{' '}
					<button type="submit">Connect</button>
				</form>
			) : (
				<Suspense fallback={<p>Connecting…</p>}>
					<ClientView room={room} />
				</Suspense>
			)}
		</div>
	)
}

export const Server: Story = {
	render: () => {
		return <ServerEntrypoint />
	},
}

export const Client: Story = {
	render: () => {
		return <ClientEntrypoint />
	},
}
