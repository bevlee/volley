import { error, json } from '@sveltejs/kit';
import { ReplayError, replayGame } from '#lib/engine/replay.ts';
import { FINGERPRINT, VERSION } from '#lib/server/build.ts';
import { getStore } from '#lib/server/store.ts';
import { isPlayerId, MAX_UPLOAD_BYTES, parseUpload, rateLimiter } from '#lib/server/uploads.ts';
import { summary } from './summary.ts';
import type { RequestHandler } from './$types';

const PAGE = 50;
const uploads = rateLimiter(6, 60_000);

/** Your games, newest first: `?player=<playerId>`, and `&before=<ISO time>` for the next page. */
export const GET: RequestHandler = async ({ url }) => {
	const player = url.searchParams.get('player');
	if (!isPlayerId(player)) error(400, 'Bad playerId');
	const beforeParam = url.searchParams.get('before');
	const before = beforeParam ? new Date(beforeParam) : undefined;
	if (before && Number.isNaN(before.getTime())) error(400, 'Bad before');
	const store = await getStore(FINGERPRINT);
	const games = await store.byPlayer(player, FINGERPRINT, PAGE, before);
	return json({ games: games.map((g) => summary(g, player)), more: games.length === PAGE });
};

/**
 * Saves a finished game against the computer. The browser played it, so the server replays it with
 * its own engine and keeps its own result; a record that doesn't replay is refused.
 */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	if (!uploads(getClientAddress())) error(429, 'Too many uploads; try again in a minute');
	const text = await request.text();
	if (text.length > MAX_UPLOAD_BYTES) error(413, 'Too big');
	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		error(400, 'Not JSON');
	}
	const upload = parseUpload(body);
	if (typeof upload === 'string') error(400, upload);
	if (upload.fingerprint !== FINGERPRINT) error(409, 'The rules have changed since this game was played; reload the page');
	let final;
	try {
		final = replayGame(upload.record);
	} catch (e) {
		if (e instanceof ReplayError) error(400, `The game doesn't replay: ${e.message}`);
		throw e;
	}
	const store = await getStore(FINGERPRINT);
	const id = await store.save({
		mode: 'computer',
		version: VERSION,
		fingerprint: FINGERPRINT,
		record: upload.record,
		players: upload.team === 'A' ? { A: upload.playerId, B: null } : { A: null, B: upload.playerId },
		score: final.score,
		winner: final.winner!
	});
	return json({ id }, { status: 201 });
};
