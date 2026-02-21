import babel from '@rollup/plugin-babel'
import commonjs from '@rollup/plugin-commonjs'
import resolve from '@rollup/plugin-node-resolve'
import path from 'path'
import del from 'rollup-plugin-delete'
import peerDepsExternal from 'rollup-plugin-peer-deps-external'
import postcss from 'rollup-plugin-postcss'
import preserveDirectives from 'rollup-plugin-preserve-directives'
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
		external: ['react', '@device-portal/client'],
		plugins: [
			del({ targets: outputDirectory + '/*' }),
			peerDepsExternal(),
			postcss({
				extract: true,
				modules: true,
			}),
			resolve({
				extensions: ['.js', '.jsx', '.ts', '.tsx'],
			}),
			commonjs(),
			typescript({
				useTsconfigDeclarationDir: false,
			}),
			babel({
				babelHelpers: 'bundled',
				extensions: ['.js', '.jsx', '.ts', '.tsx'],
			}),
			preserveDirectives(),
			!isWatch &&
				strip({
					include: ['src/**/*.ts', 'src/**/*.js', 'src/**/*.tsx', 'src/**/*.jsx'],
					functions: ['console.log', 'console.debug', 'console.warn'],
				}),
		],
	}
}
