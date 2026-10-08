import { describe, expect, it } from 'vitest';
import { fixedChoosers } from '../engine/choosers';
import { step } from '../engine/rally';
import { replayGame } from '../engine/replay';
import type { Calls, Game, TeamId } from '../engine/types';
import { playsItself } from '../ui/story';
import { playbackMs } from '../ui/timing';
import {
	act,
	CLOCK_MS,
	connect,
	createRoom,
	disconnect,
	expired,
	IDLE_ROOM_MS,
	join,
	leave,
	newCode,
	redact,
	tick,
	type Outcome,
	type Room,
	type Send,
	type ToClient
} from './room';
import { isCode, normaliseCode } from '../online/codes';

/** A room with both players in: A is p1, B is p2. The clock is on B's serve. */
function seated(seed = 42): Room {
	const room = createRoom('KXQT', 'p1', seed, 0);
	join(room, 'p2', 0);
	return room;
}

const events = (sends: Send[]) => sends.map((s) => `${s.to}:${s.msg.event}`);
const msgs = <E extends ToClient['event']>(sends: Send[], event: E) =>
	sends.filter((s) => s.msg.event === event).map((s) => s.msg as Extract<ToClient, { event: E }>);

/** Every game state in what was sent. */
const gamesIn = (sends: Send[]): Game[] =>
	sends.flatMap((s) => (s.msg.event === 'states' ? s.msg.chain : s.msg.event === 'snapshot' ? [s.msg.game] : []));

/** Serves, then returns the room at its first call, with the time the clock was started. */
function atFirstCall(seed = 42) {
	const room = seated(seed);
	const served = act(room, 'B', { type: 'serve', at: 0 }, 1000);
	return { room, served };
}

const attacker = (room: Room): TeamId => room.game.attack!.team;
const defender = (room: Room): TeamId => (attacker(room) === 'A' ? 'B' : 'A');

/** Plays out the clock until the game is over: the computer makes every call. */
function runOut(room: Room, from = 0): { now: number; outcomes: Outcome[] } {
	let now = from;
	const outcomes: Outcome[] = [];
	while (room.game.phase.kind !== 'gameOver') {
		now = room.clock!.deadline;
		outcomes.push(tick(room, now));
	}
	return { now, outcomes };
}

describe('rooms', () => {
	it('makes 4-letter codes, avoiding codes in use', () => {
		const taken = new Set(['BBBB']);
		const draws = [0, 0, 0, 0, 0.99, 0.99, 0.99, 0.99];
		expect(newCode((c) => taken.has(c), () => draws.shift()!)).toBe('ZZZZ');
		expect(normaliseCode(' kx qt ')).toBe('KXQT');
		expect(isCode('KXQT')).toBe(true);
		expect(['KXQ', 'KXQTT', 'KXQA', 'KX1T'].some(isCode)).toBe(false);
	});

	it('seats the creator as A and the joiner as B, and refuses a third player', () => {
		const room = createRoom('KXQT', 'p1', 42, 0);
		const joined = join(room, 'p2', 5);
		expect(joined).toMatchObject({ team: 'B' });
		expect(events((joined as { send: Send[] }).send)).toEqual(['B:snapshot', 'A:snapshot']);
		expect(join(room, 'p3', 6)).toEqual({ error: 'That room is full' });
	});

	it('gives a returning player their own seat back', () => {
		const room = seated();
		disconnect(room, 'A', 10);
		const back = join(room, 'p1', 20);
		expect(back).toMatchObject({ team: 'A' });
		expect(room.seats.A!.connected).toBe(true);
	});

	it('starts the clock on B serving once both are in', () => {
		const room = seated();
		expect(room.clock).toEqual({ action: 'serve', teams: ['B'], deadline: CLOCK_MS });
		expect(createRoom('KXQT', 'p1', 1, 0).clock).toBeNull();
	});

	it('never sends the seed or the RNG state', () => {
		const room = seated();
		const sends: Send[] = [...(join(room, 'p2', 0) as { send: Send[] }).send];
		const { outcomes } = runOut(room);
		sends.push(...outcomes.flatMap((o) => o.send));
		const games = gamesIn(sends);
		expect(games.length).toBeGreaterThan(100);
		expect(games.every((g) => g.seed === 0 && g.rngState === 0)).toBe(true);
	});
});

describe('serving', () => {
	it('lets only the serving team serve, and only on the current step', () => {
		const room = seated();
		expect(act(room, 'A', { type: 'serve', at: 0 }, 1).send).toEqual([]);
		expect(act(room, 'B', { type: 'serve', at: 5 }, 1).send).toEqual([]);
		expect(room.game.steps).toBe(0);
	});

	it('plays the serve, pass and set up to the call, then starts both clocks after the playback', () => {
		const { room, served } = atFirstCall();
		const chain = msgs(served.send, 'states')[0].chain;
		expect(chain.map((g) => g.phase.kind)).toEqual(['freeBall', 'set', 'calls']);
		expect(room.clock).toEqual({
			action: 'call',
			teams: [attacker(room), defender(room)],
			deadline: 1000 + playbackMs(chain) + CLOCK_MS
		});
		expect(msgs(served.send, 'clock')[0].clock!.msLeft).toBe(playbackMs(chain) + CLOCK_MS);
	});
});

describe('the call', () => {
	it("tells the other side only that a team has locked in, never what it called", () => {
		const { room } = atFirstCall();
		const at = room.game.steps;
		const r = act(room, attacker(room), { type: 'shot', at, shot: 'cross' }, 2000);
		expect(new Set(r.send.map((s) => s.msg.event))).toEqual(new Set(['locked', 'clock']));
		expect(JSON.stringify(r.send)).not.toContain('cross');
		expect(room.clock!.teams).toEqual([defender(room)]);
	});

	it('plays the call with both sides\' choices once both are in', () => {
		const { room } = atFirstCall();
		const at = room.game.steps;
		const before = room.game;
		const calls: Calls = { shot: 'tip', block: 'cross', stance: 'short' };
		act(room, defender(room), { type: 'defence', at, block: calls.block, stance: calls.stance }, 2000);
		const r = act(room, attacker(room), { type: 'shot', at, shot: calls.shot }, 3000);

		const expected = [step(before, fixedChoosers(calls))];
		expected.push(step(expected[0]));
		while (playsItself(expected.at(-1)!)) expected.push(step(expected.at(-1)!));
		expect(msgs(r.send, 'states')[0].chain).toEqual(expected.map(redact));
		expect(room.byComputer).toEqual([{ shot: false, defence: false }]);
	});

	it('ignores calls from the wrong side, bad values, second goes and stale steps', () => {
		const { room } = atFirstCall();
		const at = room.game.steps;
		const A = attacker(room);
		const D = defender(room);
		expect(act(room, D, { type: 'shot', at, shot: 'line' }, 1).send).toEqual([]);
		expect(act(room, A, { type: 'defence', at, block: 'line', stance: 'deep' }, 1).send).toEqual([]);
		expect(act(room, A, { type: 'shot', at, shot: 'smash' as never }, 1).send).toEqual([]);
		expect(act(room, D, { type: 'defence', at, block: 'line', stance: 'sideways' as never }, 1).send).toEqual([]);
		expect(act(room, A, { type: 'shot', at: at - 1, shot: 'line' }, 1).send).toEqual([]);
		expect(act(room, A, { type: 'shot', at, shot: 'line' }, 1).send).not.toEqual([]);
		expect(act(room, A, { type: 'shot', at, shot: 'tip' }, 1).send).toEqual([]);
		expect(room.pending).toEqual({ shot: 'line' });
	});
});

describe('the clock', () => {
	it('does nothing before the deadline', () => {
		const { room } = atFirstCall();
		expect(tick(room, room.clock!.deadline - 1)).toEqual({ send: [] });
	});

	it('serves for a team that runs out of time', () => {
		const room = seated();
		const r = tick(room, CLOCK_MS);
		expect(msgs(r.send, 'timedOut')).toContainEqual({ event: 'timedOut', team: 'B', action: 'serve' });
		expect(room.game.phase.kind).toBe('calls');
	});

	it("makes the call for the side that runs out, keeping the other side's call", () => {
		const { room } = atFirstCall();
		const at = room.game.steps;
		const D = defender(room);
		act(room, attacker(room), { type: 'shot', at, shot: 'tip' }, 2000);
		const r = tick(room, room.clock!.deadline);
		// Both players are told, about the defending side only.
		expect(msgs(r.send, 'timedOut')).toEqual([
			{ event: 'timedOut', team: D, action: 'call' },
			{ event: 'timedOut', team: D, action: 'call' }
		]);
		expect(room.byComputer).toEqual([{ shot: false, defence: true }]);
		expect(room.game.log.find((e) => e.tag === 'calls')!.data!.shot).toBe('tip');
	});

	it('ignores a call that arrives after its clock ran out', () => {
		const { room } = atFirstCall();
		const at = room.game.steps;
		const A = attacker(room);
		tick(room, room.clock!.deadline);
		const steps = room.game.steps;
		expect(act(room, A, { type: 'shot', at, shot: 'line' }, room.clock?.deadline ?? 0).send).toEqual([]);
		expect(room.game.steps).toBe(steps);
	});

	it('stops while both players are away, and picks up where it was', () => {
		const { room } = atFirstCall();
		const left = room.clock!.deadline - 5000;
		disconnect(room, 'A', 5000);
		expect(room.clock!.pausedLeft).toBeUndefined();
		disconnect(room, 'B', 5000);
		expect(room.clock!.pausedLeft).toBe(left);
		expect(tick(room, 10_000_000)).toEqual({ send: [] });
		const sends = connect(room, 'A', 10_000_000);
		expect(room.clock!.deadline).toBe(10_000_000 + left);
		expect(msgs(sends, 'snapshot')[0].clock).toMatchObject({ msLeft: left, paused: false });
	});

	it('keeps running for a player who is away while the other is there', () => {
		const { room } = atFirstCall();
		disconnect(room, defender(room), 5000);
		expect(tick(room, room.clock!.deadline).send).not.toEqual([]);
	});

	it('stops while a seat is empty, and carries on with whoever takes it', () => {
		const { room } = atFirstCall();
		const A = attacker(room);
		const sends = leave(room, A, 5000);
		expect(msgs(sends, 'presence')).toEqual([{ event: 'presence', opponent: 'waiting' }]);
		expect(tick(room, 10_000_000)).toEqual({ send: [] });
		expect(join(room, 'p3', 10_000_000)).toMatchObject({ team: A });
		expect(room.clock!.pausedLeft).toBeUndefined();
		expect(room.game.phase.kind).toBe('calls');
	});
});

describe('game over', () => {
	it('saves a record that replays to the same game, with both players', () => {
		const room = seated(7);
		// The players make some calls, the clock makes the rest.
		let now = 0;
		let save: Outcome['save'];
		for (let i = 0; room.game.phase.kind !== 'gameOver'; i++) {
			const at = room.game.steps;
			const r =
				room.game.phase.kind === 'calls' && i % 3 === 0
					? act(room, attacker(room), { type: 'shot', at, shot: (['line', 'cross', 'tip'] as const)[i % 3] }, now)
					: room.game.phase.kind === 'calls' && i % 3 === 1
						? act(room, defender(room), { type: 'defence', at, block: 'cross', stance: 'deep' }, now)
						: tick(room, (now = room.clock!.deadline));
			save = r.save ?? save;
		}
		expect(save).toBeDefined();
		expect(save!.players).toEqual({ A: 'p1', B: 'p2' });
		expect(save!.score).toEqual(room.game.score);
		expect(save!.record.calls.some((c) => !c.byComputer.shot)).toBe(true);
		expect(save!.record.calls.some((c) => c.byComputer.shot)).toBe(true);
		expect(replayGame(save!.record)).toEqual(room.game);
	});

	it('starts a rematch when both ask, with the players swapping teams', () => {
		const room = seated();
		runOut(room);
		expect(act(room, 'A', { type: 'rematch' }, 1).send.map((s) => s.msg)).toContainEqual({ event: 'rematchAsked', team: 'A' });
		expect(room.game.phase.kind).toBe('gameOver');
		const r = act(room, 'B', { type: 'rematch' }, 2, () => 99);
		expect(room.seats.A!.playerId).toBe('p2');
		expect(room.seats.B!.playerId).toBe('p1');
		expect(room.game.steps).toBe(0);
		expect(room.byComputer).toEqual([]);
		expect(room.clock).toMatchObject({ action: 'serve', teams: ['B'] });
		expect(msgs(r.send, 'snapshot').map((m) => m.team).sort()).toEqual(['A', 'B']);
	});

	it("doesn't take a rematch before the game is over", () => {
		const room = seated();
		expect(act(room, 'A', { type: 'rematch' }, 1).send).toEqual([]);
	});
});

describe('expiry', () => {
	it('closes rooms that are empty, idle, or left with nobody connected', () => {
		const room = seated();
		expect(expired(room, 1000)).toBe(false);
		expect(expired(room, IDLE_ROOM_MS + 1)).toBe(true);
		disconnect(room, 'A', 0);
		disconnect(room, 'B', 0);
		expect(expired(room, 31 * 60_000)).toBe(true);
		leave(room, 'A', 0);
		leave(room, 'B', 0);
		expect(expired(room, 0)).toBe(true);
	});
});
