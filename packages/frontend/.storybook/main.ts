import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
	stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],

	addons: [
		getAbsolutePath('@storybook/addon-links'),
		getAbsolutePath('@storybook/addon-onboarding'),
		getAbsolutePath('@storybook/addon-docs'),
	],

	framework: {
		name: getAbsolutePath('@storybook/react-vite'),
		options: {},
	},

	async viteFinal(config) {
		const { mergeConfig } = await import('vite')
		return mergeConfig(config, {
			resolve: {
				alias: {
					'@storybook/addon-docs/mdx-react-shim': fileURLToPath(
						import.meta.resolve('@storybook/addon-docs/mdx-react-shim'),
					),
				},
			},
		})
	},

	mdxLoaderOptions: async (options: any) => {
		return {
			...options,
			mdxCompileOptions: {
				...options.mdxCompileOptions,
				providerImportSource: fileURLToPath(
					import.meta.resolve('@storybook/addon-docs/mdx-react-shim'),
				),
			},
		}
	},
}
export default config

function getAbsolutePath(value: string): any {
	return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)))
}
