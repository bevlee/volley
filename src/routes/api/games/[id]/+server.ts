import { error, json } from '@sveltejs/kit';
import { CURRENT } from '#lib/server/build.ts';
import { getStore } from '#lib/server/store.ts';
import { isPlayerId } from '#lib/server/uploads.ts';
import { summary } from '../summary.ts';
import type { RequestHandler } from './$types';

/** One saved game with its record, for the replay page. `?player=` says which side you played. */
export const GET: RequestHandler = async ({ params, url }) => {
	if (!/^[A-Za-z0-9]{10}$/.test(params.id)) error(404, 'No such game');
	const store = await getStore(CURRENT);
	const game = await store.get(params.id, CURRENT);
	if (!game) error(404, 'No such game');
	const player = url.searchParams.get('player');
	return json({ ...summary(game, isPlayerId(player) ? player : null), record: game.record });
};
