import type { Browser, Page } from '@playwright/test'

/** Opens a story in its own browser context, i.e. a separate peer. */
export async function openStory(browser: Browser, storyId: string) {
	const page = await (await browser.newContext()).newPage()
	await page.goto(`/iframe.html?id=${storyId}&viewMode=story`)
	return page
}

/** A game card in the lobby or in the list of hosted games. */
export const gameCard = (page: Page, text: string) =>
	page.locator('.lobby-card', { hasText: text })

/** Scores in the leaderboard, top first. */
export const scores = (page: Page) =>
	page.locator('.lobby-scores li span:last-child').allTextContents()
