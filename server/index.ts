import { createServer } from 'node:http';
// @ts-expect-error: built by `npm run build`; adapter-node ships no types for it.
import { handler } from '../build/handler.js';
import { FINGERPRINT } from '../src/lib/server/build';
import { attachSockets } from '../src/lib/server/sockets';
import { getStore } from '../src/lib/server/store';

/**
 * Production: SvelteKit's pages, API and static files, and the game's sockets, on one port.
 * The store connects (and migrates, and drops games from old rules) before anything is served.
 */
const store = await getStore(FINGERPRINT);
const http = createServer(handler);
const sockets = attachSockets(http, { store: async () => store });
const port = Number(process.env.PORT ?? 8080);
http.listen(port, process.env.HOST ?? '0.0.0.0', () => console.log(`Listening on ${port}`));

async function shutdown() {
	// Live games are in memory and end here; finished games are already saved.
	await sockets.close();
	await store.close();
	process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
