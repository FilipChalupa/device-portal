import { expect, test } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { gameCard, openStory, scores } from './helpers'

const exampleDirectory = fileURLToPath(
	new URL('../../examples/node-host', import.meta.url),
)

let nodeHost: ChildProcess | undefined

test.afterEach(() => {
	nodeHost?.kill()
})

test('browser players join a game hosted by Node over WebRTC', async ({
	browser,
	baseURL,
}) => {
	const room = `node-e2e-${Math.random().toString(36).slice(2, 8)}`
	nodeHost = spawn(process.execPath, ['host.mjs'], {
		cwd: exampleDirectory,
		env: {
			...process.env,
			SERVER_URL: baseURL!.replace(/^http/, 'ws'),
			ROOM: room,
		},
		stdio: 'inherit',
	})

	const first = await openStory(browser, 'lobby--browser')
	const second = await openStory(browser, 'lobby--browser')
	await expect(gameCard(first, room)).toContainText('Node host')

	for (const player of [first, second]) {
		await gameCard(player, room).getByRole('button', { name: 'Join' }).click()
		await expect(player.getByRole('button', { name: /Click!/ })).toBeVisible({
			timeout: 20_000,
		})
	}

	for (let i = 0; i < 5; i++) {
		await first.getByRole('button', { name: /Click!/ }).click()
	}
	await second.getByRole('button', { name: /Click!/ }).click()
	for (const player of [first, second]) {
		await expect.poll(() => scores(player)).toEqual(['5', '1'])
	}
})
