import commonjs from '@rollup/plugin-commonjs'
import resolve from '@rollup/plugin-node-resolve'
import strip from '@rollup/plugin-strip'
import del from 'rollup-plugin-delete'
import typescript from 'rollup-plugin-typescript2'

const outputDirectory = 'dist'

export default (args) => {
	const isWatch = args.watch

	return {
		input: './src/index.ts',
		output: {
			dir: outputDirectory,
			format: 'esm',
			sourcemap: true,
			preserveModules: true,
			preserveModulesRoot: 'src',
		},
		external: ['zod'],
		plugins: [
			del({ targets: outputDirectory + '/*' }),
			resolve({
				extensions: ['.js', '.ts'],
			}),
			commonjs(),
			typescript(),
			!isWatch &&
				strip({
					include: ['src/**/*.ts', 'src/**/*.js'],
					functions: ['console.log', 'console.debug', 'console.warn'],
				}),
		],
	}
}
