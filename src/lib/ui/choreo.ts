import type { Game, Slot, TeamId } from '../engine/types';
import {
	arcPath,
	arcPoint,
	ballRest,
	ballVia,
	flightKind,
	outcome,
	positions,
	rollBall,
	rollingFrom,
	VIEW,
	zoneCenter,
	type Point,
	type Positions
} from './layout';
import { playerActions, stepEntries, type Action } from './story';
import { FLIGHT, MOVE_MS, RESOLVE_MS, pauseAfter, type FlightKind } from './timing';

/**
 * How one step plays out on the court, laid out in advance as a timeline: who runs where and when,
 * each flight of the ball, when the dice roll, and when each player's move and the result land. The
 * court only samples it (see `sample`), so everything happens on one clock and in the right order:
 * the block jumps when the ball reaches the net, the point is told when the ball hits the floor.
 *
 * A step plays in up to three beats:
 * 1. move: anyone who must get to a spot to roll runs there, and a pass or dig flies to the setter;
 * 2. roll: the step's dice tumble where the rollers stand;
 * 3. reveal: the court shows the new state, players move on, and the ball flies to where it ends up,
 *    via the block or the net if it's stopped there. The result is told when it lands.
 * Times are in ms at normal pace, from the start of the step.
 */

/** Where each player's chip is drawn. */
export type Spots = Record<TeamId, Record<Slot, Point>>;

/** One flight of the ball. */
export interface Leg {
	kind: FlightKind;
	from: Point;
	to: Point;
	at: number;
	ms: number;
}

/** Everyone running from one set of spots to the next. */
export interface Glide {
	from: Spots;
	to: Spots;
	at: number;
	ms: number;
}

export interface Timeline {
	start: { spots: Spots; ball: Point };
	glides: Glide[];
	legs: Leg[];
	/** When the dice start rolling, and where the rollers stand; null when the step rolls nothing. */
	roll: { at: number; pos: Positions } | null;
	/** When the court switches to the new state: the calls, the arrows, who is attacking. */
	revealAt: number;
	/** When the ball comes to rest. */
	landAt: number;
	/**
	 * When the step is told (the score, the commentary, the callout, the court's reaction): a result
	 * (a dig, a block, a point) once the ball lands, a serve, pass or set as it's played.
	 */
	tellAt: number;
	/** Each player's move (a spike, a block, a dig), keyed `${team}-${slot}`, and when it happens. */
	actions: { key: string; action: Action; at: number }[];
	/** The step starts a new picture (a new rally, a serve or an attack): earlier trails and dice clear. */
	fresh: boolean;
	duration: number;
}

/** What the court draws at one moment of a timeline. */
export interface Frame {
	spots: Spots;
	ball: Point & { ground: Point; height: number };
	/** The flights so far this step, each drawn up to where the ball has got to. */
	trails: string[];
	actions: Record<string, Action>;
}

const TEAMS: TeamId[] = ['A', 'B'];
const SLOTS: Slot[] = ['blocker', 'defender'];

export const spotsOf = (pos: Positions, bottom: TeamId = 'A'): Spots => {
	const team = (t: TeamId) => ({ blocker: zoneCenter(t, pos[t].blocker, bottom), defender: zoneCenter(t, pos[t].defender, bottom) });
	return { A: team('A'), B: team('B') };
};

const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
const sameSpots = (a: Spots, b: Spots) => TEAMS.every((t) => SLOTS.every((s) => samePoint(a[t][s], b[t][s])));
const end = (leg: Leg) => leg.at + leg.ms;

/**
 * Lays out the step from `prev` to `next`. `start` is where the players are drawn when it begins,
 * if not where `prev` puts them (the defending pair on the spots the player was choosing).
 */
export function choreograph(prev: Game, next: Game, { bottom = 'A', start }: { bottom?: TeamId; start?: Positions } = {}): Timeline {
	const from = start ?? positions(prev);
	const rolling = rollingFrom(from, next.rolls);
	const settled = positions(next);
	const startSpots = spotsOf(from, bottom);
	const rollSpots = spotsOf(rolling, bottom);
	const endSpots = spotsOf(settled, bottom);
	const startBall = ballRest(prev, from, bottom);
	const rollBallAt = next.rolls.length ? rollBall(prev, next.rolls, rolling, bottom) : startBall;

	const glides: Glide[] = [];
	const legs: Leg[] = [];

	// 1. Move: runners get to their spots while a pass or dig flies to the setter.
	let moveMs = 0;
	if (!sameSpots(startSpots, rollSpots)) {
		glides.push({ from: startSpots, to: rollSpots, at: 0, ms: MOVE_MS });
		moveMs = MOVE_MS;
	}
	if (!samePoint(startBall, rollBallAt)) {
		legs.push({ kind: 'lob', from: startBall, to: rollBallAt, at: 0, ms: FLIGHT.lob.ms });
		moveMs = Math.max(moveMs, FLIGHT.lob.ms);
	}

	// 2. Roll, once the ball has arrived.
	const roll = next.rolls.length ? { at: moveMs, pos: rolling } : null;
	const revealAt = roll ? roll.at + RESOLVE_MS : moveMs;

	// 3. Reveal: players move on, and the ball flies to where it ends up, via the net if it stops there.
	if (!sameSpots(rollSpots, endSpots)) glides.push({ from: rollSpots, to: endSpots, at: revealAt, ms: MOVE_MS });
	const endBall = ballRest(next, settled, bottom);
	const via = ballVia(next, settled, bottom);
	const kind = flightKind(next);
	let contactAt: number | null = null;
	if (via) {
		const into: Leg = { kind, from: rollBallAt, to: via, at: revealAt, ms: FLIGHT[kind].ms };
		const off: FlightKind = outcome(next) === 'touched' ? 'deflect' : 'drop';
		legs.push(into, { kind: off, from: via, to: endBall, at: end(into), ms: FLIGHT[off].ms });
		contactAt = end(into);
	} else if (!samePoint(rollBallAt, endBall)) {
		legs.push({ kind, from: rollBallAt, to: endBall, at: revealAt, ms: FLIGHT[kind].ms });
	}
	const landAt = legs.length && legs.at(-1)!.at >= revealAt ? end(legs.at(-1)!) : revealAt;

	// The block goes up as the ball reaches the net; the digger plays it as it comes down.
	const attack = legs.find((l) => l.at === revealAt);
	const blockAt = contactAt ?? (attack ? attack.at + attack.ms * netCrossing(attack) : revealAt);
	const dig = stepEntries(next).find((e) => e.tag === 'dig')?.data;
	const actions = Object.entries(playerActions(next)).map(([key, action]) => {
		const digger = dig && key === `${dig.team}-defender`;
		const at = action.move === 'block' ? blockAt : digger ? landAt : revealAt;
		return { key, action, at };
	});

	const tags = stepEntries(next).map((e) => e.tag);
	const fresh = ['rallyStart', 'serve', 'hit', 'swing'].some((t) => tags.includes(t));
	const tellAt = ['dig', 'block', 'point'].some((t) => tags.includes(t)) ? landAt : revealAt;
	const duration = Math.max(landAt, ...legs.map(end), ...glides.map((g) => g.at + g.ms));
	return { start: { spots: startSpots, ball: startBall }, glides, legs, roll, revealAt, landAt, tellAt, actions, fresh, duration };
}

/** How far along a flight (0–1) the ball crosses the net. */
function netCrossing(leg: Leg): number {
	const dy = leg.to.y - leg.from.y;
	if (!dy) return 0.5;
	return Math.min(1, Math.max(0, (VIEW.netY - leg.from.y) / dy));
}

const easeOut = (u: number) => 1 - (1 - u) ** 3;
const progress = (t: number, at: number, ms: number) => (ms <= 0 ? 1 : Math.min(1, Math.max(0, (t - at) / ms)));
const lerp = (a: Point, b: Point, u: number): Point => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });

/** The court `t` ms into a timeline. */
export function sample(tl: Timeline, t: number): Frame {
	let spots = tl.start.spots;
	for (const g of tl.glides) {
		if (t < g.at) break;
		const u = easeOut(progress(t, g.at, g.ms));
		spots = { A: { blocker: lerp(g.from.A.blocker, g.to.A.blocker, u), defender: lerp(g.from.A.defender, g.to.A.defender, u) }, B: { blocker: lerp(g.from.B.blocker, g.to.B.blocker, u), defender: lerp(g.from.B.defender, g.to.B.defender, u) } };
	}
	const started = tl.legs.filter((l) => t >= l.at);
	const leg = started.at(-1);
	const ball = leg
		? arcPoint(leg.from, leg.to, FLIGHT[leg.kind].apex, progress(t, leg.at, leg.ms))
		: { ...tl.start.ball, ground: tl.start.ball, height: 0 };
	const trails = started.map((l) => arcPath(l.from, l.to, FLIGHT[l.kind].apex, progress(t, l.at, l.ms)));
	const actions = Object.fromEntries(tl.actions.filter((a) => t >= a.at).map((a) => [a.key, a.action]));
	return { spots, ball, trails, actions };
}

/** The court at rest on `g`, with the players at `pos`: nothing playing. */
export function still(g: Game, pos: Positions = positions(g), bottom: TeamId = 'A'): Frame {
	const at = ballRest(g, pos, bottom);
	return { spots: spotsOf(pos, bottom), ball: { ...at, ground: at, height: 0 }, trails: [], actions: playerActions(g) };
}

/** A timeline's flights drawn in full, to keep on the court as the possession's build-up. */
export const fullTrails = (tl: Timeline) => tl.legs.map((l) => arcPath(l.from, l.to, FLIGHT[l.kind].apex));

/**
 * How long, after it ends, the court waits before playing the step after `next`. The pause after a
 * step counts from its reveal (the ball's flight plays during it), but never cuts a step short.
 */
export const holdAfter = (tl: Timeline, next: Game) => Math.max(0, tl.revealAt + pauseAfter(next) - tl.duration);

/**
 * How long a chain of steps from `from` takes to play on the court at normal pace, with the pauses
 * between them: what a screen needs to catch up after the server sends it.
 */
export function playbackMs(from: Game, chain: Game[]): number {
	let ms = 0;
	let prev = from;
	chain.forEach((g, i) => {
		const tl = choreograph(prev, g);
		ms += tl.duration + (i < chain.length - 1 ? holdAfter(tl, g) : 0);
		prev = g;
	});
	return ms;
}
