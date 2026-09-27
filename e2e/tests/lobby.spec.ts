import { expect, test } from '@playwright/test'
import { gameCard, openStory, scores } from './helpers'

test('browser-hosted games are listed, joinable and removed when stopped', async ({
	browser,
}) => {
	const host = await openStory(browser, 'lobby--playground')
	const observer = await openStory(browser, 'lobby--browser')
	await expect(observer.getByText('Live list')).toBeVisible()

	await host.getByRole('button', { name: 'Host a new game' }).click()
	const hostedGames = host.locator('.lobby-section').first()
	const room = (await hostedGames
		.locator('.lobby-card .lobby-status')
		.textContent())!.replace('room ', '')
	await expect(gameCard(observer, room)).toContainText('0 / 3 players')

	const players = []
	for (let i = 0; i < 3; i++) {
		const player = await openStory(browser, 'lobby--browser')
		await gameCard(player, room).getByRole('button', { name: 'Join' }).click()
		await expect(player.getByRole('button', { name: /Click!/ })).toBeVisible({
			timeout: 20_000,
		})
		players.push(player)
	}
	await expect(gameCard(observer, room)).toContainText('3 / 3 players')
	await expect(
		gameCard(observer, room).getByRole('button', { name: 'Full' }),
	).toBeDisabled()
	await expect(hostedGames).toContainText('3 / 3 players')

	const [first, second] = players
	for (let i = 0; i < 3; i++) {
		await first.getByRole('button', { name: /Click!/ }).click()
	}
	await expect.poll(() => scores(second)).toEqual(['3'])

	// Renaming updates the listing live without dropping the players.
	await hostedGames.locator('input').fill('Renamed game')
	await expect(gameCard(observer, 'Renamed game')).toBeVisible()
	await first.getByRole('button', { name: /Click!/ }).click()
	await expect.poll(() => scores(second)).toEqual(['4'])
	await expect(first.locator('.lobby-status')).toContainText('Connected')
	await expect(hostedGames).toContainText('3 / 3 players')

	// The listing goes with the host even though players stay in the room.
	await hostedGames.getByRole('button', { name: 'Stop hosting' }).click()
	await expect(observer.getByText('No games right now')).toBeVisible()
	await expect(first.getByText(/Reconnecting/)).toBeVisible()
})
