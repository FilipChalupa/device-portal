import { defineConfig } from 'tsup'

// A single config, so `clean` cannot wipe the output of a parallel build.
// The CLI shebang lives in src/main.ts; tsup marks that output executable.
export default defineConfig({
	entry: ['src/main.ts', 'src/server.ts', 'src/node.ts', 'src/core.ts'],
	format: ['esm'],
	target: 'node22',
	outDir: 'dist',
	clean: true,
	dts: {
		entry: ['src/server.ts', 'src/node.ts', 'src/core.ts'],
	},
})
