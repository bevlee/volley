import { randomChoosers, type Choosers } from '../engine/choosers';
import { newGame, other, step } from '../engine/rally';
import { recordGame, type GameRecord, type RecordedCall } from '../engine/replay';
import type { Channel, Game, Shot, Stance, TeamId } from '../engine/types';
import type { Action, ClockView, FromClient, Names, Presence, ToClient } from '../online/protocol';

export type { Action, ClockView, FromClient, Names, Presence, ToClient };
import { CODE_LENGTH, CODE_LETTERS } from '../online/codes';
import { playsItself } from '../ui/story';
import { playbackMs } from '../ui/timing';

/**
 * One online game between two players, with no sockets: everything a player sends goes through
 * `act`, the clock through `tick`, and both return what to send to whom. The time is passed in so
 * tests can use fake time; the socket layer owns the one real timer per room.
 */

/** How long a player has for each action. */
export const CLOCK_MS = 20_000;
/** A room nobody has been connected to for this long is closed. */
export const EMPTY_ROOM_MS = 30 * 60_000;
/** A room where nothing has happened for this long is closed. */
export const IDLE_ROOM_MS = 2 * 60 * 60_000;

const SHOTS: readonly Shot[] = ['line', 'cross', 'tip'];
const CHANNELS: readonly Channel[] = ['line', 'cross'];
const STANCES: readonly Stance[] = ['deep', 'short'];

export interface Seat {
	playerId: string;
	/** Shown to both players; set when they take the seat. Nothing depends on it. */
	name: string;
	connected: boolean;
}

export interface Clock {
	action: Action;
	/** The teams that still owe the action. At the call, both until one locks in. */
	teams: TeamId[];
	deadline: number;
	/** Set while the clock is stopped (both players away): the time it had left. */
	pausedLeft?: number;
}

export interface Room {
	code: string;
	game: Game;
	seats: Partial<Record<TeamId, Seat>>;
	/** The calls locked in so far at the current call. Never sent to the other team. */
	pending: { shot?: Shot; defence?: { block: Channel; stance: Stance } };
	/** Who made each call so far, for the replay record. */
	byComputer: RecordedCall['byComputer'][];
	clock: Clock | null;
	rematch: TeamId[];
	/** The saved game's id, once it's over and saved. */
	savedId: string | null;
	lastActive: number;
}

/** The game with the seed and RNG state blanked: either would let a player work out the dice to come. */
export const redact = (g: Game): Game => ({ ...g, seed: 0, rngState: 0 });

export interface Send {
	to: TeamId;
	msg: ToClient;
}

export interface Save {
	record: GameRecord;
	/** Each team's playerId; null if the seat was empty when the game ended (the computer finished it). */
	players: Record<TeamId, string | null>;
	/** The names at the end of the game. */
	names: Names;
	score: Game['score'];
	winner: TeamId;
}

export interface Outcome {
	send: Send[];
	/** Set when the game has just ended: the socket layer saves it, then calls `saved`. */
	save?: Save;
}

/** Seeds come from the OS's secure RNG: a guessable seed would give away every die. */
export const newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] >>> 1;

export function newCode(taken: (code: string) => boolean, random: () => number = Math.random): string {
	for (;;) {
		let code = '';
		for (let i = 0; i < CODE_LENGTH; i++) code += CODE_LETTERS[Math.floor(random() * CODE_LETTERS.length)];
		if (!taken(code)) return code;
	}
}

/** `name` must already be clean (see `cleanName`). */
export function createRoom(code: string, playerId: string, name: string, seed: number, now: number): Room {
	return {
		code,
		game: newGame(seed),
		seats: { A: { playerId, name, connected: true } },
		pending: {},
		byComputer: [],
		clock: null,
		rematch: [],
		savedId: null,
		lastActive: now
	};
}

export const teamOf = (room: Room, playerId: string): TeamId | null =>
	room.seats.A?.playerId === playerId ? 'A' : room.seats.B?.playerId === playerId ? 'B' : null;

const out = (to: TeamId | 'both', msg: ToClient): Send[] => (to === 'both' ? ['A', 'B'] : [to]).map((t) => ({ to: t as TeamId, msg }));

export const names = (room: Room): Names => ({ A: room.seats.A?.name ?? null, B: room.seats.B?.name ?? null });

function presence(room: Room, team: TeamId): Presence {
	const seat = room.seats[other(team)];
	return !seat ? 'waiting' : seat.connected ? 'connected' : 'away';
}

export function clockView(room: Room, now: number): ClockView | null {
	const c = room.clock;
	if (!c) return null;
	const paused = c.pausedLeft !== undefined;
	return { action: c.action, teams: [...c.teams], msLeft: paused ? c.pausedLeft! : Math.max(0, c.deadline - now), paused };
}

/** The teams that have locked in their part of the current call. */
const locked = (room: Room): TeamId[] => {
	const attacking = room.game.attack?.team;
	if (room.game.phase.kind !== 'calls' || !attacking) return [];
	return [...(room.pending.shot ? [attacking] : []), ...(room.pending.defence ? [other(attacking)] : [])];
};

export function snapshot(room: Room, team: TeamId, now: number): Send {
	return {
		to: team,
		msg: {
			event: 'snapshot',
			code: room.code,
			team,
			game: redact(room.game),
			locked: locked(room),
			clock: clockView(room, now),
			opponent: presence(room, team),
			names: names(room),
			savedId: room.savedId
		}
	};
}

/**
 * Takes the free seat: B in a new room, where the game starts with the clock on B's serve, or
 * whichever seat someone left, where the game carries on.
 */
export function join(room: Room, playerId: string, name: string, now: number): { team: TeamId; send: Send[] } | { error: string } {
	const seated = teamOf(room, playerId);
	if (seated) return { team: seated, send: connect(room, seated, now) };
	const team: TeamId | null = !room.seats.B ? 'B' : !room.seats.A ? 'A' : null;
	if (!team) return { error: 'That room is full' };
	room.seats[team] = { playerId, name, connected: true };
	room.lastActive = now;
	if (room.clock) resumeClock(room, now);
	else startClock(room, [], now);
	return { team, send: [snapshot(room, team, now), snapshot(room, other(team), now)] };
}

function pauseClock(room: Room, now: number) {
	const c = room.clock;
	if (c && c.pausedLeft === undefined) c.pausedLeft = Math.max(0, c.deadline - now);
}

/** Restarts a stopped clock, if both seats are filled and someone's there to play. */
function resumeClock(room: Room, now: number) {
	const c = room.clock;
	const anyone = room.seats.A?.connected || room.seats.B?.connected;
	if (c?.pausedLeft === undefined || !room.seats.A || !room.seats.B || !anyone) return;
	c.deadline = now + c.pausedLeft;
	delete c.pausedLeft;
}

/** The player's socket is back: they get where things stand, the other side gets told. */
export function connect(room: Room, team: TeamId, now: number): Send[] {
	room.seats[team]!.connected = true;
	resumeClock(room, now);
	return [
		snapshot(room, team, now),
		...out(other(team), { event: 'presence', opponent: 'connected' }),
		...(room.seats[other(team)] ? out(other(team), { event: 'clock', clock: clockView(room, now) }) : [])
	];
}

/** The player's socket dropped. Their clock keeps running, unless both are now away: then it stops. */
export function disconnect(room: Room, team: TeamId, now: number): Send[] {
	const seat = room.seats[team];
	if (!seat) return [];
	seat.connected = false;
	if (!room.seats.A?.connected && !room.seats.B?.connected) pauseClock(room, now);
	return out(other(team), { event: 'presence', opponent: 'away' });
}

/**
 * The player left for another room. The seat is free for whoever joins with the code next, and the
 * clock stops until then.
 */
export function leave(room: Room, team: TeamId, now: number): Send[] {
	delete room.seats[team];
	pauseClock(room, now);
	room.rematch = room.rematch.filter((t) => t !== team);
	return [...out(other(team), { event: 'presence', opponent: 'waiting' }), ...out(other(team), { event: 'names', names: names(room) })];
}

export const isEmpty = (room: Room) => !room.seats.A && !room.seats.B;

export function expired(room: Room, now: number): boolean {
	const anyone = room.seats.A?.connected || room.seats.B?.connected;
	return isEmpty(room) || now - room.lastActive > IDLE_ROOM_MS || (!anyone && now - room.lastActive > EMPTY_ROOM_MS);
}

/** Who owes the next action in `game`, if anyone. */
function owed(game: Game): { action: Action; teams: TeamId[] } | null {
	const p = game.phase;
	if (p.kind === 'serve' || p.kind === 'pointOver') return { action: 'serve', teams: [game.serving] };
	if (p.kind === 'calls') return { action: 'call', teams: [game.attack!.team, other(game.attack!.team)] };
	return null;
}

/** Starts the clock for whatever `room.game` now waits on, once `chain` has played out on screen. */
function startClock(room: Room, chain: Game[], now: number) {
	const next = owed(room.game);
	room.clock = next ? { ...next, deadline: now + playbackMs(chain) + CLOCK_MS } : null;
	const playing = room.seats.A && room.seats.B && (room.seats.A.connected || room.seats.B.connected);
	if (!playing) pauseClock(room, now);
}

/**
 * Steps the game: once with `choosers`, then (after the calls) the attack, then everything that
 * plays on its own, up to the next decision. Sends the chain and the new clock, and the save at
 * game over.
 */
function advance(room: Room, choosers: Choosers, now: number): Outcome {
	const chain = [step(room.game, choosers)];
	let g = chain[0];
	if (g.phase.kind === 'hit') chain.push((g = step(g)));
	while (playsItself(g)) chain.push((g = step(g)));
	room.game = g;
	room.pending = {};
	room.lastActive = now;
	startClock(room, chain, now);
	const send = [
		...out('both', { event: 'states', chain: chain.map(redact) }),
		...out('both', { event: 'clock', clock: clockView(room, now) })
	];
	if (g.phase.kind !== 'gameOver') return { send };
	return {
		send,
		save: {
			record: recordGame(g, room.byComputer),
			players: { A: room.seats.A?.playerId ?? null, B: room.seats.B?.playerId ?? null },
			names: names(room),
			score: { ...g.score },
			winner: g.winner!
		}
	};
}

/** Both sides' parts of the call are in (or made by the computer): reveal it and play the attack. */
function resolveCall(room: Room, now: number): Outcome {
	const { shot, defence } = room.pending;
	room.byComputer.push({ shot: shot === undefined, defence: defence === undefined });
	return advance(
		room,
		{
			shot: shot === undefined ? randomChoosers.shot : () => shot,
			block: defence === undefined ? randomChoosers.block : () => defence.block,
			stance: defence === undefined ? randomChoosers.stance : () => defence.stance
		},
		now
	);
}

const NOTHING: Outcome = { send: [] };

/** Applies one message from a seated player. Anything out of turn, stale or invalid is ignored. */
export function act(room: Room, team: TeamId, msg: FromClient, now: number, seed = newSeed): Outcome {
	const g = room.game;
	const bothSeated = room.seats.A && room.seats.B;
	if (!bothSeated) return NOTHING;
	if (msg.type === 'rematch') return rematch(room, team, now, seed);
	if (msg.at !== g.steps) return NOTHING;
	switch (msg.type) {
		case 'serve':
			if (owed(g)?.action !== 'serve' || g.serving !== team) return NOTHING;
			return advance(room, randomChoosers, now);
		case 'shot': {
			if (g.phase.kind !== 'calls' || g.attack!.team !== team || room.pending.shot) return NOTHING;
			if (!SHOTS.includes(msg.shot)) return NOTHING;
			room.pending.shot = msg.shot;
			return lockIn(room, team, now);
		}
		case 'defence': {
			if (g.phase.kind !== 'calls' || g.attack!.team === team || room.pending.defence) return NOTHING;
			if (!CHANNELS.includes(msg.block) || !STANCES.includes(msg.stance)) return NOTHING;
			room.pending.defence = { block: msg.block, stance: msg.stance };
			return lockIn(room, team, now);
		}
	}
	return NOTHING;
}

/** One side has locked in: the other side learns only that, and their clock is the only one left. */
function lockIn(room: Room, team: TeamId, now: number): Outcome {
	room.lastActive = now;
	if (room.pending.shot && room.pending.defence) return resolveCall(room, now);
	room.clock!.teams = room.clock!.teams.filter((t) => t !== team);
	return {
		send: [
			...out('both', { event: 'locked', team }),
			...out('both', { event: 'clock', clock: clockView(room, now) })
		]
	};
}

/** The clock ran out: the computer serves, or makes the missing parts of the call. */
export function tick(room: Room, now: number): Outcome {
	const c = room.clock;
	if (!c || c.pausedLeft !== undefined || now < c.deadline) return NOTHING;
	const timedOut = c.teams.flatMap((team) => out('both', { event: 'timedOut', team, action: c.action }));
	const result = c.action === 'serve' ? advance(room, randomChoosers, now) : resolveCall(room, now);
	return { ...result, send: [...timedOut, ...result.send] };
}

/** The game was saved; both players get its replay id. */
export function saved(room: Room, id: string): Send[] {
	room.savedId = id;
	return out('both', { event: 'saved', id });
}

/**
 * At game over, both players ask for a rematch to start one. They swap teams, so the first serve
 * (always B's) alternates between them.
 */
function rematch(room: Room, team: TeamId, now: number, seed: () => number): Outcome {
	if (room.game.phase.kind !== 'gameOver' || room.rematch.includes(team)) return NOTHING;
	room.rematch.push(team);
	if (room.rematch.length < 2) return { send: out('both', { event: 'rematchAsked', team }) };
	room.seats = { A: room.seats.B, B: room.seats.A };
	room.game = newGame(seed());
	room.pending = {};
	room.byComputer = [];
	room.rematch = [];
	room.savedId = null;
	room.lastActive = now;
	startClock(room, [], now);
	return { send: [snapshot(room, 'A', now), snapshot(room, 'B', now)] };
}
