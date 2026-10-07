import { config } from '../engine/config';
import { other, partner } from '../engine/rally';
import { defenderZone, GRID } from '../engine/rules';
import type { Channel, Game, Roll, Slot, Stance, TeamId, Zone } from '../engine/types';
import { stepEntries } from './story';

/** SVG viewBox is 300 × 560: B's half 15–275, net 275–285, A's half 285–545. */
export const VIEW = { width: 300, height: 560, netY: 280 };
const COL = 90;
const ROW = 130;

export interface Point {
	x: number;
	y: number;
}

/** A zone's rectangle. A faces up from the bottom; B is mirrored at the top. */
export function zoneBox(team: TeamId, zone: Zone) {
	const [row, col] = GRID[zone];
	if (team === 'A') return { x: 15 + col * COL, y: 285 + row * ROW, w: COL, h: ROW };
	return { x: 15 + (2 - col) * COL, y: 145 - row * ROW, w: COL, h: ROW };
}

export function zoneCenter(team: TeamId, zone: Zone): Point {
	const b = zoneBox(team, zone);
	return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

export type Positions = Record<TeamId, Record<Slot, Zone>>;

/** Ready position: blocker at the net, defender in the middle of the back court. */
const READY: Record<Slot, Zone> = { blocker: 2, defender: 6 };
/** Receiving a serve or free ball: the passer (who will hit) back left, their partner back right. */
const RECEIVE: Record<Slot, Zone> =
	config.freeBallReceiver === 'blocker' ? { blocker: 5, defender: 1 } : { blocker: 1, defender: 5 };
/** Where the setter stands to set, and where the hitter attacks from. */
export const SET_SPOT: Zone = 3;
const HIT_SPOT: Zone = 4;

/**
 * Where each player stands. Moves happen in volleyball order: the pass or dig is played where the
 * player is; the setter runs to the setting spot only when they set; the passer or digger comes up
 * to hit only once the ball is set.
 */
export function positions(g: Game): Positions {
	const pos: Positions = { A: { ...READY }, B: { ...READY } };
	const phase = g.phase;
	if (phase.kind === 'serve') {
		pos[phase.team][g.servers[phase.team]] = 1;
		pos[other(phase.team)] = { ...RECEIVE };
		return pos;
	}
	const a = g.attack;
	if (phase.kind === 'freeBall' && !a) {
		// The rally's opening serve: the receivers are already in place.
		pos[phase.team] = { ...RECEIVE };
		return pos;
	}
	// A free ball mid-rally (block touch or mis-hit) keeps the attack's picture until the pass.
	if (!a) return pos;
	const setter = partner(a.hitter);
	if (phase.kind === 'set') {
		// Passed or dug, not yet set: the pair are still where they played the first touch.
		pos[a.team] =
			a.source === 'dig'
				? ({ [a.hitter]: a.dugAt ?? READY.defender, [setter]: READY.blocker } as Record<Slot, Zone>)
				: { ...RECEIVE };
	} else {
		pos[a.team][a.hitter] = HIT_SPOT;
		pos[a.team][setter] = SET_SPOT;
	}
	if (a.calls) {
		const defending = other(a.team);
		pos[defending].blocker = 2;
		pos[defending].defender = defenderZone(a.calls.stance, a.calls.block);
	}
	return pos;
}

/** Where everyone stands while the player is choosing a defence: the defending pair on the chosen spots. */
export function previewDefence(g: Game, block: Channel, stance: Stance): Positions {
	const pos = positions(g);
	if (!g.attack) return pos;
	const defending = other(g.attack.team);
	pos[defending] = { blocker: 2, defender: defenderZone(stance, block) };
	return pos;
}

/** Where the players who roll in a step stand to roll: a setter moves to the setting spot first. */
export function rollPositions(before: Game, rolls: Roll[]): Positions {
	const pos = positions(before);
	for (const r of rolls) {
		const partnerAt = pos[r.team][partner(r.slot)];
		// If the digger is already on the setting spot, the setter sets from where they are.
		if (r.label === 'set' && partnerAt !== SET_SPOT) pos[r.team][r.slot] = SET_SPOT;
		// The passer gets back to their passing spot, or the middle if their partner is there.
		if (r.label === 'pass') pos[r.team][r.slot] = partnerAt === RECEIVE[r.slot] ? 6 : RECEIVE[r.slot];
	}
	return pos;
}

export const DIE_SIZE = 20;
const DIE_GAP = 6;

export interface PlacedDie extends Roll {
	x: number;
	y: number;
}

/** Each player's dice in a centred row under their zone centre, i.e. on the tile where they rolled. */
export function placeDice(rolls: Roll[], pos: Positions): PlacedDie[] {
	const placed: PlacedDie[] = [];
	for (const team of ['A', 'B'] as const) {
		for (const slot of ['blocker', 'defender'] as const) {
			const mine = rolls.filter((r) => r.team === team && r.slot === slot);
			if (!mine.length) continue;
			const c = zoneCenter(team, pos[team][slot]);
			const width = mine.length * DIE_SIZE + (mine.length - 1) * DIE_GAP;
			mine.forEach((r, i) =>
				placed.push({ ...r, x: c.x - width / 2 + i * (DIE_SIZE + DIE_GAP), y: c.y + 26 })
			);
		}
	}
	return placed;
}

export type Role ='Attacker' | 'Setter' | 'Blocker' | 'Defender';

/** The attacking pair are attacker and setter; otherwise players go by their designated slot. */
export function roleOf(g: Game, team: TeamId, slot: Slot): Role {
	const a = g.attack;
	if (a?.team === team) return a.hitter === slot ? 'Attacker' : 'Setter';
	return slot === 'blocker' ? 'Blocker' : 'Defender';
}

export function ballAt(g: Game, pos: Positions): Point {
	if (g.phase.kind === 'serve') {
		const team = g.phase.team;
		return zoneCenter(team, pos[team][g.servers[team]]);
	}
	if (g.phase.kind === 'freeBall') {
		const team = g.phase.team;
		return zoneCenter(team, pos[team][config.freeBallReceiver]);
	}
	const a = g.attack;
	if (!a) return { x: VIEW.width / 2, y: VIEW.netY };
	// A stuffed ball drops straight back down on the hitter's side of the net.
	if (stepEntries(g).some((e) => e.tag === 'point' && e.data?.kind === 'stuff')) return zoneCenter(a.team, 3);
	if (a.landing) return zoneCenter(other(a.team), a.landing);
	// Before the set the ball stays with the passer or digger; after it, it's with the hitter.
	return zoneCenter(a.team, pos[a.team][a.hitter]);
}

/** Where the ball is while a step's dice roll: on a pass or set it goes to that player at their spot. */
export function rollBall(before: Game, rolls: Roll[], rollPos: Positions): Point {
	const touch = rolls.find((r) => r.label === 'set' || r.label === 'pass');
	return touch ? zoneCenter(touch.team, rollPos[touch.team][touch.slot]) : ballAt(before, rollPos);
}

/** Candidate heights for a callout in each team's half, net side to baseline (viewBox units). */
const CALLOUT_BANDS: Record<TeamId, number[]> = { A: [320, 415, 515], B: [240, 145, 45] };

/**
 * Where to put a callout for `team`, as a % of the court's height: the band of their half that is
 * furthest from any player, so the headline never sits on the players who just made the play.
 */
export function calloutTop(team: TeamId, pos: Positions): number {
	const chipYs = (['A', 'B'] as const).flatMap((t) =>
		(['blocker', 'defender'] as const).map((slot) => zoneCenter(t, pos[t][slot]).y)
	);
	const clearance = (y: number) => Math.min(...chipYs.map((c) => Math.abs(c - y)));
	const best = CALLOUT_BANDS[team].reduce((a, b) => (clearance(b) > clearance(a) ? b : a));
	return (100 * best) / VIEW.height;
}

export type FlightKind = 'spike' | 'tip' | 'serve' | 'lob';

/** How high (viewBox units) and how long (ms) each kind of ball flies. */
export const FLIGHT: Record<FlightKind, { apex: number; ms: number }> = {
	spike: { apex: 10, ms: 280 },
	tip: { apex: 45, ms: 520 },
	serve: { apex: 80, ms: 760 },
	lob: { apex: 55, ms: 560 }
};

/** The kind of flight the ball is on: an attack from the latest step, a serve, or a pass or set. */
export function flightKind(g: Game, setting: boolean): FlightKind {
	if (setting) return 'lob';
	const entries = stepEntries(g);
	const hit = entries.find((e) => e.tag === 'hit' || e.tag === 'swing');
	if (hit) return hit.data?.shot === 'tip' ? 'tip' : 'spike';
	return entries.some((e) => e.tag === 'serve') ? 'serve' : 'lob';
}

/**
 * The ball `t` (0–1) of the way along a parabola from `from` to `to`. `ground` is the shadow on the
 * court; the ball is drawn `height` above it, peaking at `apex` halfway.
 */
export function arcPoint(from: Point, to: Point, apex: number, t: number) {
	const ground = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
	const height = 4 * apex * t * (1 - t);
	return { x: ground.x, y: ground.y - height, ground, height };
}
