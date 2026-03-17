import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
    // root: 'src/',
    publicDir: './resources/',
    base: './',

	plugins: [svelte()],

	server: {
		port: 9910,
		strictPort: true
	},
	preview: {
		port: 9910,
		strictPort: true
	}
});