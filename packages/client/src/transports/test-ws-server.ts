import { createNodeSignalingServer } from '@device-portal/server/node'

export interface TestServer {
	url: string
	close: () => Promise<void>
}

export async function createTestServer(): Promise<TestServer> {
	const { server, port } = await createNodeSignalingServer().start(
		0,
		'127.0.0.1',
	)

	return {
		url: `ws://127.0.0.1:${port}`,
		close: () =>
			new Promise<void>((resolve) => {
				server.close(() => resolve())
			}),
	}
}
