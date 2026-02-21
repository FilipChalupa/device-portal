import commonjs from '@rollup/plugin-commonjs'
import resolve from '@rollup/plugin-node-resolve'
import path from 'path'
import del from 'rollup-plugin-delete'
import typescript from 'rollup-plugin-typescript2'
import strip from '@rollup/plugin-strip'
import packageJson from './package.json' with { type: 'json' }

const outputDirectory = path.parse(packageJson.main).dir

export default (args) => {
	const isWatch = args.watch

	return {
		input: './src/index.ts',
		output: {
			dir: outputDirectory,
			format: 'esm',
			sourcemap: true,
			preserveModules: true,
		},
		plugins: [
			del({ targets: outputDirectory + '/*' }),
			resolve({
				extensions: ['.js', '.ts'],
			}),
			commonjs(),
			typescript(),
			!isWatch &&
				strip({
					include: ['**/*.ts', '**/*.js'],
					functions: ['console.log', 'console.debug', 'console.warn'],
				}),
		],
	}
}
