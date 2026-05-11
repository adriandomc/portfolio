import { vitePreprocess } from '@astrojs/svelte';

export default {
	preprocess: vitePreprocess({
		style: {
			css: {
				preprocessorOptions: {
					scss: {
						additionalData: '@use "sass:color"; @use "/src/styles/_variables.scss" as *;'
					}
				}
			}
		}
	}),
}
