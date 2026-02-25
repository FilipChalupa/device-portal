import type { Preview } from '@storybook/react-vite'
import { themes } from 'storybook/theming'
import './globals.css'

const preview: Preview = {
	parameters: {
		darkMode: {
			current: 'dark',
			stylePreview: true,
			darkClass: 'dark',
			classTarget: 'html',
			dark: { ...themes.dark, appBg: '#1a1a1a', contentBg: '#1a1a1a' },
		},
		docs: {
			theme: themes.dark,
		},
		options: {
			storySort: ['Welcome', '*'],
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
