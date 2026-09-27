import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.E2E_PORT ?? 18300)
// Dual-stack server checked over IPv6: under WSL a connection to a closed IPv4
// port hangs instead of being refused, which stalls Playwright's pre-start
// check for minutes. `::1` is refused immediately.
const origin = `http://[::1]:${port}`

/**
 * The server CLI serves the built Storybook (`npm run build`) on the same
 * origin as the signaling endpoints, so stories connect to this server.
 */
export default defineConfig({
	testDir: './tests',
	timeout: 60_000,
	// Tests share one signaling server; each uses unique rooms, but running
	// them one at a time keeps WebRTC timing predictable on small CI runners.
	workers: 1,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? 'github' : 'list',
	use: {
		baseURL: origin,
		trace: 'retain-on-failure',
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		command: 'node ../packages/server/dist/main.js',
		env: { PORT: String(port), HOST: '::' },
		url: `${origin}/health`,
		reuseExistingServer: !process.env.CI,
	},
})
