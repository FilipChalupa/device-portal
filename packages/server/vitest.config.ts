import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node',
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
