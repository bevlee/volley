import { describe, expect, it } from 'vitest';
import { randomChoosers } from '#lib/engine/choosers.ts';
import { newGame, playGame } from '#lib/engine/rally.ts';
import { recordGame } from '#lib/engine/replay.ts';
import { FINGERPRINT } from '#lib/server/build.ts';
import { parseUpload, rateLimiter } from '#lib/server/uploads.ts';
import { GET as getOne } from './[id]/+server.ts';
import { GET as list, POST } from './+server.ts';

const ME = crypto.randomUUID();

/** A finished game against the computer, played entirely by the computer, as the browser would upload it. */
function upload(seed = 11, over: Record<string, unknown> = {}) {
	const game = playGame(newGame(seed), randomChoosers);
	const calls = game.log.filter((e) => e.tag === 'calls').map(() => ({ shot: true, defence: true }));
	return { ...recordGame(game, calls), fingerprint: FINGERPRINT, playerId: ME, team: 'A', ...over };
}

let address = 0;
/** Calls a handler with just the parts of the request event it uses. Each call comes from a new address. */
async function call(handler: (e: never) => Response | Promise<Response>, init: { url?: string; body?: unknown; params?: object; from?: string } = {}) {
	const url = new URL(init.url ?? '/api/games', 'http://localhost');
	const request = new Request(url, init.body === undefined ? {} : { method: 'POST', body: typeof init.body === 'string' ? init.body : JSON.stringify(init.body) });
	const from = init.from ?? `10.0.0.${++address}`;
	try {
		return await handler({ request, url, params: init.params ?? {}, getClientAddress: () => from } as never);
	} catch (e) {
		// SvelteKit's error() throws an HttpError; turn it into a response like the server would.
		const err = e as { status?: number; body?: { message: string } };
		if (err.status) return new Response(JSON.stringify(err.body), { status: err.status });
		throw e;
	}
}

describe('uploading a game against the computer', () => {
	it("saves it with the server's own result, and it shows in your history and as a replay", async () => {
		const body = upload();
		const res = await call(POST, { body });
		expect(res.status).toBe(201);
		const { id } = await res.json();
		const final = playGame(newGame(11), randomChoosers);

		const history = await (await call(list, { url: `/api/games?player=${ME}` })).json();
		expect(history.games[0]).toMatchObject({ id, mode: 'computer', you: 'A', score: final.score, sides: { A: 'player', B: 'computer' } });

		const one = await (await call(getOne, { url: `/api/games/${id}?player=${ME}`, params: { id } })).json();
		expect(one.record).toEqual({ seed: body.seed, calls: body.calls });
		expect(JSON.stringify(one)).not.toContain(ME);
	});

	it('refuses a game that was tampered with', async () => {
		const body = upload(12);
		body.calls[0].shot = body.calls[0].shot === 'line' ? 'cross' : 'line';
		const res = await call(POST, { body });
		expect(res.status).toBe(400);
		expect((await res.json()).message).toMatch(/doesn't replay/);
	});

	it('refuses a game that stops partway', async () => {
		const body = upload(13);
		body.calls = body.calls.slice(0, 5);
		expect((await call(POST, { body })).status).toBe(400);
	});

	it('refuses a game played under other rules', async () => {
		expect((await call(POST, { body: upload(14, { fingerprint: 'old' }) })).status).toBe(409);
	});

	it('refuses bodies that are too big or not JSON', async () => {
		expect((await call(POST, { body: 'x'.repeat(70_000) })).status).toBe(413);
		expect((await call(POST, { body: '{nope' })).status).toBe(400);
	});

	it('limits uploads from one address', async () => {
		const statuses = [];
		for (let i = 0; i < 8; i++) statuses.push((await call(POST, { body: '{}', from: '192.168.1.1' })).status);
		expect(statuses.filter((s) => s === 429)).toHaveLength(2);
	});
});

describe('reading games', () => {
	it('needs a valid playerId for a history', async () => {
		expect((await call(list, { url: '/api/games?player=x' })).status).toBe(400);
		expect((await call(list, { url: `/api/games?player=${crypto.randomUUID()}` })).status).toBe(200);
	});

	it("says no such game for ids that aren't there", async () => {
		expect((await call(getOne, { url: '/api/games/AAAAAAAAAA', params: { id: 'AAAAAAAAAA' } })).status).toBe(404);
		expect((await call(getOne, { url: '/api/games/..', params: { id: '..' } })).status).toBe(404);
	});
});

describe('parseUpload', () => {
	const good = () => upload(15);
	it.each([
		['not an object', null, 'Expected a JSON object'],
		['a negative seed', { seed: -1 }, 'Bad seed'],
		['a fractional seed', { seed: 1.5 }, 'Bad seed'],
		['calls that are not a list', { calls: 'x' }, 'Bad calls'],
		['a call with a bad shot', { calls: [{ shot: 'smash', block: 'line', stance: 'deep', byComputer: { shot: true, defence: true } }] }, 'Bad calls'],
		['a call missing who made it', { calls: [{ shot: 'line', block: 'line', stance: 'deep' }] }, 'Bad calls'],
		['a short playerId', { playerId: 'abc' }, 'Bad playerId'],
		['a bad team', { team: 'C' }, 'Bad team']
	])('refuses %s', (_, change, message) => {
		expect(parseUpload(change === null ? null : { ...good(), ...change })).toBe(message);
	});

	it('keeps only the fields it knows', () => {
		const body = good();
		(body.calls[0] as unknown as Record<string, unknown>).extra = 'x';
		const parsed = parseUpload(body);
		expect(typeof parsed).toBe('object');
		expect(JSON.stringify(parsed)).not.toContain('extra');
	});
});

describe('rateLimiter', () => {
	it('allows the limit in each window', () => {
		const allow = rateLimiter(2, 1000);
		expect([allow('a', 0), allow('a', 1), allow('a', 2), allow('b', 2), allow('a', 1000)]).toEqual([true, true, false, true, true]);
	});
});
