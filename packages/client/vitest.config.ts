import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node',
		testTimeout: 10_000,
	},
	resolve: {
		alias: {
			'@device-portal/server/server': path.resolve(
				__dirname,
				'../server/src/server.ts',
			),
			'@device-portal/client': path.resolve(
				__dirname,
				'src/index.ts',
			),
		},
	},
})
