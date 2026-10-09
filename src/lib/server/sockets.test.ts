import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connectClient, type Socket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import { replayGame } from '../engine/replay';
import type { Game } from '../engine/types';
import { CLOCK_MS, type ToClient } from './room';
import { attachSockets } from './sockets';
import { memoryStore, type GameStore } from './store';

type Msg<E extends ToClient['event']> = Extract<ToClient, { event: E }>;

/** A test player: a socket, and every message it has had, by event. */
interface Player {
	socket: Socket;
	id: string;
	got: Partial<Record<ToClient['event'], ToClient[]>>;
	/** Resolves with the next message of `event` to arrive. */
	next<E extends ToClient['event']>(event: E): Promise<Msg<E>>;
	emit(event: string, payload?: unknown): void;
	/** Sends a request that the server answers through Socket.IO's acknowledgement. */
	ask(event: string, ...args: unknown[]): Promise<unknown>;
	/** The latest game this player has been sent. */
	game(): Game;
}

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
	for (const c of cleanups.splice(0).reverse()) await c();
});

async function startServer(store: GameStore = memoryStore()) {
	const http = createServer();
	const sockets = attachSockets(http, { store: async () => store });
	await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
	const { port } = http.address() as AddressInfo;
	cleanups.push(() => sockets.close());
	return { url: `http://127.0.0.1:${port}`, sockets, store };
}

function player(url: string, id: string = crypto.randomUUID()): Player {
	const socket = connectClient(url, { auth: { playerId: id }, transports: ['websocket'], reconnection: false });
	cleanups.push(() => void socket.close());
	const got: Player['got'] = {};
	const waiting: { event: string; resolve: (m: ToClient) => void }[] = [];
	socket.onAny((event: ToClient['event'], msg: ToClient) => {
		(got[event] ??= []).push(msg);
		const i = waiting.findIndex((w) => w.event === event);
		if (i >= 0) waiting.splice(i, 1)[0].resolve(msg);
	});
	return {
		socket,
		id,
		got,
		next: (event) => new Promise((resolve) => waiting.push({ event, resolve: resolve as (m: ToClient) => void })),
		emit: (event, payload) => void socket.emit(event, payload),
		ask: (event, ...args) => new Promise((resolve) => socket.emit(event, ...args, resolve)),
		game() {
			const states = (got.states ?? []) as Msg<'states'>[];
			const snaps = (got.snapshot ?? []) as Msg<'snapshot'>[];
			const lastChain = states.at(-1)?.chain.at(-1);
			const lastSnap = snaps.at(-1)?.game;
			if (!lastChain) return lastSnap!;
			if (!lastSnap) return lastChain;
			return lastSnap.steps >= lastChain.steps ? lastSnap : lastChain;
		}
	};
}

const connected = (p: Player) => new Promise<void>((resolve, reject) => {
	if (p.socket.connected) return resolve();
	p.socket.once('connect', () => resolve());
	p.socket.once('connect_error', reject);
});

/** Makes a room with one player and joins it with another. */
async function pair(url: string) {
	const a = player(url);
	const b = player(url);
	await Promise.all([connected(a), connected(b)]);
	// The server acks the create before it sends A's first snapshot: take that one first, or the
	// wait below can pick it up instead of the snapshot that comes with B joining.
	const created = a.next('snapshot');
	const { code } = (await a.ask('create', 'Ann')) as { code: string };
	await created;
	const joined = Promise.all([a.next('snapshot'), b.next('snapshot')]);
	expect(await b.ask('join', code.toLowerCase(), '  Bo  ')).toEqual({ code, team: 'B' });
	await joined;
	return { a, b, code };
}

describe('sockets', () => {
	it('refuses a connection without a proper playerId', async () => {
		const { url } = await startServer();
		const p = player(url, 'short');
		await expect(connected(p)).rejects.toThrow(/Bad playerId/);
	});

	it('plays a call between two players, revealing it only once both are in', async () => {
		const { url } = await startServer();
		const { a, b } = await pair(url);

		const toCall = b.next('states');
		b.emit('serve', { at: 0 });
		const chain = (await toCall).chain;
		const atCall = chain.at(-1)!;
		expect(atCall.phase.kind).toBe('calls');
		expect(atCall.seed).toBe(0);
		expect(atCall.rngState).toBe(0);

		const attacker = atCall.attack!.team === 'A' ? a : b;
		const defender = attacker === a ? b : a;
		const lockedSeen = defender.next('locked');
		attacker.emit('shot', { at: atCall.steps, shot: 'tip' });
		expect(await lockedSeen).toEqual({ event: 'locked', team: atCall.attack!.team });

		const revealed = attacker.next('states');
		defender.emit('defence', { at: atCall.steps, block: 'line', stance: 'short' });
		const after = (await revealed).chain;
		expect(after[0].log.find((e) => e.tag === 'calls' && e.rally === atCall.rally)?.data).toMatchObject({ shot: 'tip', block: 'line', stance: 'short' });
	});

	it("starts a player's clock when their screen says it has caught up", async () => {
		const { url } = await startServer();
		const { b } = await pair(url);
		// B serves first; until B's screen is ready, the server holds more than a full clock.
		expect((b.got.snapshot!.at(-1) as Msg<'snapshot'>).clock!.msLeft).toBeGreaterThan(CLOCK_MS);
		const clock = b.next('clock');
		b.emit('ready', { at: 0 });
		expect((await clock).clock!.msLeft).toBeLessThanOrEqual(CLOCK_MS);
	});

	it('shows both names to both players', async () => {
		const { url } = await startServer();
		const { a, b } = await pair(url);
		expect(a.got.snapshot!.at(-1)).toMatchObject({ names: { A: 'Ann', B: 'Bo' } });
		expect(b.got.snapshot!.at(-1)).toMatchObject({ names: { A: 'Ann', B: 'Bo' } });
	});

	it('gives a player who reconnects their seat and where the game is', async () => {
		const { url } = await startServer();
		const { a, b, code } = await pair(url);
		const away = b.next('presence');
		a.socket.close();
		expect(await away).toEqual({ event: 'presence', opponent: 'away' });

		const back = player(url, a.id);
		const welcome = new Promise((r) => back.socket.once('welcome', r));
		const snap = back.next('snapshot');
		expect(await welcome).toEqual({ seated: true });
		const here = b.next('presence');
		const s = await snap;
		expect(s).toMatchObject({ code, team: 'A', opponent: 'connected' });
		expect(await here).toEqual({ event: 'presence', opponent: 'connected' });
	});

	it("says so for a code that isn't a game, or a full one", async () => {
		const { url } = await startServer();
		const { code } = await pair(url);
		const c = player(url);
		const welcome = new Promise((r) => c.socket.once('welcome', r));
		await connected(c);
		expect(await welcome).toEqual({ seated: false });
		expect(await c.ask('join', 'ZZZZ', 'Cy')).toEqual({ error: 'No game with that code' });
		expect(await c.ask('join', code, 'Cy')).toEqual({ error: 'That room is full' });
		expect(await c.ask('join', code, '   ')).toEqual({ error: 'Pick a name' });
		expect(await c.ask('create', '')).toEqual({ error: 'Pick a name' });
	});

	it('saves the game at the end and tells both players', async () => {
		const store = memoryStore();
		const { url, sockets } = await startServer(store);
		const { a, b, code } = await pair(url);
		const room = sockets.rooms.get(code)!;
		// Run the clock out to near the end by hand, then let the players finish it over the sockets.
		const saveA = a.next('saved');
		const saveB = b.next('saved');
		while (room.game.phase.kind !== 'gameOver') {
			const at = room.game.steps;
			const kind = room.game.phase.kind;
			const next = a.next('states');
			if (kind === 'calls') {
				const att = room.game.attack!.team === 'A' ? a : b;
				const def = att === a ? b : a;
				att.emit('shot', { at, shot: 'cross' });
				def.emit('defence', { at, block: 'line', stance: 'deep' });
			} else {
				(room.game.serving === 'A' ? a : b).emit('serve', { at });
			}
			await next;
		}
		const [{ id }] = await Promise.all([saveA, saveB]);
		const saved = (await store.get(id, (await import('./build')).FINGERPRINT))!;
		expect(saved.mode).toBe('online');
		expect(saved.players).toEqual({ A: a.id, B: b.id });
		expect(saved.names).toEqual({ A: 'Ann', B: 'Bo' });
		expect(replayGame(saved.record)).toEqual(room.game);
		expect(saved.score).toEqual(room.game.score);
		expect(a.game().phase.kind).toBe('gameOver');
	}, 60_000);
});
