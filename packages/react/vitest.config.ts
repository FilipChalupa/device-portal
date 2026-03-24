import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		include: ['src/__tests__/**/*.test.{ts,tsx}'],
		environment: 'jsdom',
		testTimeout: 10_000,
		setupFiles: ['src/__tests__/setup.ts'],
	},
	resolve: {
		alias: {
			'@device-portal/client': path.resolve(
				__dirname,
				'../client/src/index.ts',
			),
		},
	},
})
