import { defineConfig } from 'tsup'

export default defineConfig([
	{
		entry: ['src/main.ts'],
		format: ['esm'],
		target: 'node22',
		outDir: 'dist',
		banner: {
			js: '#!/usr/bin/env node',
		},
	},
	{
		entry: ['src/server.ts', 'src/core.ts'],
		format: ['esm'],
		target: 'node22',
		outDir: 'dist',
		dts: true,
	},
])
