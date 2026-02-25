import type { Preview } from '@storybook/react-vite'

const preview: Preview = {
	parameters: {
		options: {
			storySort: ['Welcome', '*'],
		},
		darkMode: {
			darkClass: 'color-scheme-dark',
			lightClass: 'color-scheme-light',
		},
		actions: { argTypesRegex: '^on[A-Z].*' },
		controls: {
			matchers: {
				color: /(background|color)$/i,
				date: /Date$/i,
			},
		},
	},
}

export default preview
