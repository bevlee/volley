import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import type { Plugin } from 'vite';

/**
 * Online play on the dev server: Socket.IO sits next to Vite's own hot-reload socket. The socket code
 * loads through Vite's SSR loader, so it shares modules (and the game store) with the API routes.
 * Changes to it need a dev server restart. Production runs server/index.ts instead.
 */
const sockets = (): Plugin => ({
	name: 'volley-sockets',
	configureServer(server) {
		const http = server.httpServer;
		if (!http) return; // Vitest runs Vite without an HTTP server.
		http.once('listening', async () => {
			const { attachSockets } = await server.ssrLoadModule('/src/lib/server/sockets.ts');
			const { getStore } = await server.ssrLoadModule('/src/lib/server/store.ts');
			const { FINGERPRINT } = await server.ssrLoadModule('/src/lib/server/build.ts');
			attachSockets(http, { store: () => getStore(FINGERPRINT) });
		});
	}
});

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// A Node build: server/index.ts mounts its handler next to the game's sockets. Pages still
			// render only in the browser (ssr = false); the server adds the /api routes.
			adapter: adapter({ precompress: true })
		}),
		sockets()
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
