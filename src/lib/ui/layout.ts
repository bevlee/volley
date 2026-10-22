import { config } from '../engine/config';
import { other, partner } from '../engine/rally';
import { CORNER, defenderZone, GRID, isRead, TARGET, tempoIn, ZONES } from '../engine/rules';
import type { BlockMode, Channel, Game, Roll, Shot, Slot, Stance, TeamId, Tempo, Zone } from '../engine/types';
import { stepEntries } from './story';
import type { FlightKind } from './timing';

/** SVG viewBox is 300 × 560: B's half 15–275, net 275–285, A's half 285–545. */
export const VIEW = { width: 300, height: 560, netY: 280 };
const COL = 90;
const ROW = 130;

export interface Point {
	x: number;
	y: number;
}

/**
 * A zone's rectangle. The `bottom` team faces up from the bottom of the screen; the other team is
 * mirrored at the top. A is at the bottom unless the viewer played B (online, or their replay).
 */
export function zoneBox(team: TeamId, zone: Zone, bottom: TeamId = 'A') {
	const [row, col] = GRID[zone];
	if (team === bottom) return { x: 15 + col * COL, y: 285 + row * ROW, w: COL, h: ROW };
	return { x: 15 + (2 - col) * COL, y: 145 - row * ROW, w: COL, h: ROW };
}

/** A team's whole half of the court: the box around its six zones. */
export function halfBox(team: TeamId, bottom: TeamId = 'A') {
	const boxes = ZONES.map((z) => zoneBox(team, z, bottom));
	const x = Math.min(...boxes.map((b) => b.x));
	const y = Math.min(...boxes.map((b) => b.y));
	return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
}

export function zoneCenter(team: TeamId, zone: Zone, bottom: TeamId = 'A'): Point {
	const b = zoneBox(team, zone, bottom);
	return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

/** How far inside the sideline a line shot runs. */
const LINE_INSET = 12;

/**
 * Where a shot is drawn going to in a zone. A line shot runs straight down the sideline, so in the
 * sideline column it sits just inside the line; anything else aims at the middle of the zone.
 */
export function shotPoint(team: TeamId, zone: Zone, shot: Shot, bottom: TeamId = 'A'): Point {
	const c = zoneCenter(team, zone, bottom);
	if (shot !== 'line' || GRID[zone][1] !== GRID[TARGET.line][1]) return c;
	const b = zoneBox(team, zone, bottom);
	// The line column is on the right of the screen for the bottom team and, mirrored, on the left for the top.
	return { x: team === bottom ? b.x + b.w - LINE_INSET : b.x + LINE_INSET, y: c.y };
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
		// After a dig on the setting spot the setter set from the net (see rollPositions), so they stay there.
		pos[a.team][setter] = a.source === 'dig' && a.dugAt === SET_SPOT ? READY.blocker : SET_SPOT;
	}
	if (a.calls) {
		const defending = other(a.team);
		pos[defending] = defenceSpots(a.calls.touch && a.calls.tempo, a.calls);
		// After a block touch the defender runs in to set the ball coming off the block.
		if (phase.kind === 'touched') pos[defending].defender = SET_SPOT;
	}
	// A free ball mid-rally (an easy ball over) keeps the attack's picture, except that the passer
	// drops back to pass as it comes over, so the ball flies straight to them.
	if (phase.kind === 'freeBall') {
		const slot = config.freeBallReceiver;
		pos[phase.team][slot] = passSpot(pos, phase.team, slot);
	}
	return pos;
}

/** Where a player passes from: their receiving spot, or the middle of the back court if their partner is there. */
const passSpot = (pos: Positions, team: TeamId, slot: Slot): Zone =>
	pos[team][partner(slot)] === RECEIVE[slot] ? 6 : RECEIVE[slot];

/**
 * Where the defending pair stand for a defence: the blocker at the net, the defender on their spot.
 * In advanced mode (`tempo` set) the defender plays a corner, a quick ball leaves them no time to
 * move, and a blocker who stays down drops off the net to dig too.
 */
export function defenceSpots(tempo: Tempo | undefined, d: { block: Channel; stance: Stance; blockMode?: BlockMode }): Record<Slot, Zone> {
	if (!tempo) return { blocker: 2, defender: defenderZone(d.stance, d.block) };
	if (tempo === 'fast') return { blocker: 2, defender: READY.defender };
	if (d.blockMode === 'none') return { blocker: SET_SPOT, defender: READY.defender };
	return { blocker: 2, defender: CORNER[d.block][d.stance] };
}

/** Where everyone stands while the player is choosing a defence: the defending pair on the chosen spots. */
export function previewDefence(g: Game, d: { block: Channel; stance: Stance; blockMode?: BlockMode }): Positions {
	const pos = positions(g);
	if (!g.attack) return pos;
	pos[other(g.attack.team)] = defenceSpots(tempoIn(g), d);
	return pos;
}

export type Cover = 'blocked' | 'read' | 'open';

/** What a defence does to each shot: the blocker takes one hard shot, the defender reads another, one is open. */
export function coverage(block: Channel, stance: Stance): Record<Shot, Cover> {
	const cover = (shot: Shot): Cover =>
		shot === block ? 'blocked' : isRead(shot, block, stance) ? 'read' : 'open';
	return { line: cover('line'), cross: cover('cross'), tip: cover('tip'), over: cover('over') };
}

/** Where the players who roll in a step stand to roll: a setter moves to the setting spot first. */
export const rollPositions = (before: Game, rolls: Roll[]): Positions => rollingFrom(positions(before), rolls);

/** Where the rollers stand, starting from `from` (the court as drawn, e.g. a defence being set up). */
export function rollingFrom(from: Positions, rolls: Roll[]): Positions {
	const pos: Positions = { A: { ...from.A }, B: { ...from.B } };
	for (const r of rolls) {
		const partnerAt = pos[r.team][partner(r.slot)];
		// If the digger is already on the setting spot, the setter sets from where they are.
		if (r.label === 'set' && partnerAt !== SET_SPOT) pos[r.team][r.slot] = SET_SPOT;
		if (r.label === 'pass') pos[r.team][r.slot] = passSpot(pos, r.team, r.slot);
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
export function placeDice(rolls: Roll[], pos: Positions, bottom: TeamId = 'A'): PlacedDie[] {
	const placed: PlacedDie[] = [];
	for (const team of ['A', 'B'] as const) {
		for (const slot of ['blocker', 'defender'] as const) {
			const mine = rolls.filter((r) => r.team === team && r.slot === slot);
			if (!mine.length) continue;
			const c = zoneCenter(team, pos[team][slot], bottom);
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

export function ballAt(g: Game, pos: Positions, bottom: TeamId = 'A'): Point {
	if (g.phase.kind === 'serve') {
		const team = g.phase.team;
		return zoneCenter(team, pos[team][g.servers[team]], bottom);
	}
	if (g.phase.kind === 'freeBall') {
		const team = g.phase.team;
		return zoneCenter(team, pos[team][config.freeBallReceiver], bottom);
	}
	const a = g.attack;
	if (!a) return { x: VIEW.width / 2, y: VIEW.netY };
	// A touched ball comes off the block to the defender, who has run in to set it.
	if (g.phase.kind === 'touched') return zoneCenter(other(a.team), pos[other(a.team)].defender, bottom);
	const drop = a.team === bottom ? STUFF_DROP : -STUFF_DROP;
	// A stuffed ball comes off the block and drops just in front of the hitter, on their side of the net.
	if (outcome(g) === 'stuffed') return { x: blockHandsX(g, bottom), y: VIEW.netY + drop };
	// A hitting error (two 1s) goes into the net in front of the hitter.
	if (outcome(g) === 'netted') return { x: zoneCenter(a.team, pos[a.team][a.hitter], bottom).x, y: VIEW.netY + drop };
	if (a.landing) return zoneCenter(other(a.team), a.landing, bottom);
	// Before the set the ball stays with the passer or digger; after it, it's with the hitter.
	return zoneCenter(a.team, pos[a.team][a.hitter], bottom);
}

/** How far from the net a stuffed ball lands. */
const STUFF_DROP = 22;

/**
 * How the latest step's ball ended up, when it's not simply held or landed in a zone: stuffed back
 * by the block, touched off it, hit into the net (two 1s on the hit), or dropped by the setter (two
 * 1s on the set).
 */
export function outcome(g: Game): 'stuffed' | 'touched' | 'netted' | 'dropped' | null {
	const entries = stepEntries(g);
	const block = entries.find((e) => e.tag === 'block')?.data?.result;
	if (block === 'stuff') return 'stuffed';
	if (block === 'touch') return 'touched';
	if (entries.find((e) => e.tag === 'point')?.data?.kind !== 'shank') return null;
	return entries.some((e) => e.tag === 'swing') ? 'netted' : 'dropped';
}

/**
 * The block, drawn on the net in front of the blocker in zone 2: blocking line covers the sideline
 * half of their zone, blocking cross the half toward the middle of the court.
 */
export function blockBar(defending: TeamId, block: Channel, bottom: TeamId = 'A') {
	const box = zoneBox(defending, 2, bottom);
	const half = box.w / 2;
	// Zone 2 is on the right of the screen for the bottom team and, mirrored, on the left for the top.
	const near = defending === bottom;
	const sidelineHalf = near ? box.x + half : box.x;
	const middleHalf = near ? box.x : box.x + half;
	const x = (block === 'line' ? sidelineHalf : middleHalf) + 4;
	return { x, y: near ? VIEW.netY + 6 : VIEW.netY - 12, w: half - 8, near };
}

/** The middle of the block the defence called. */
const blockHandsX = (g: Game, bottom: TeamId) => {
	const a = g.attack!;
	const bar = blockBar(other(a.team), a.calls!.block, bottom);
	return bar.x + bar.w / 2;
};

/**
 * Where the ball meets the net on its way, if the latest step stopped it there: the block's hands
 * for a stuff or a touch, or the net in front of the hitter for a ball hit into it. The ball flies
 * there first, then on to where it ends up.
 */
export function ballVia(g: Game, pos: Positions, bottom: TeamId = 'A'): Point | null {
	const how = outcome(g);
	if (how === 'stuffed' || how === 'touched') return { x: blockHandsX(g, bottom), y: VIEW.netY };
	if (how === 'netted') return { x: zoneCenter(g.attack!.team, pos[g.attack!.team][g.attack!.hitter], bottom).x, y: VIEW.netY };
	return null;
}

/** A held ball sits at the top corner of the holder's chip. */
const HELD = { x: 34, y: -20 };
const held = (p: Point): Point => ({ x: p.x + HELD.x, y: p.y + HELD.y });

/**
 * Where the ball is drawn when play stops on `g`: held by whoever has it, landed in a zone (on the
 * sideline for a line shot down it), or loose on the floor after a stuff, an error or a dropped set.
 */
export function ballRest(g: Game, pos: Positions, bottom: TeamId = 'A'): Point {
	const at = ballAt(g, pos, bottom);
	const how = outcome(g);
	if (how === 'stuffed' || how === 'netted') return at;
	const a = g.attack;
	if (how === 'dropped' && a) {
		const setter = zoneCenter(a.team, pos[a.team][partner(a.hitter)], bottom);
		return { x: setter.x + HELD.x, y: setter.y + 26 };
	}
	if (a?.calls && a.landing && g.phase.kind !== 'touched') {
		const zone = zoneCenter(other(a.team), a.landing, bottom);
		const onLine = shotPoint(other(a.team), a.landing, a.calls.shot, bottom);
		if (at.x === zone.x && at.y === zone.y && onLine.x !== zone.x) return { x: onLine.x, y: onLine.y + HELD.y };
	}
	return held(at);
}

/** Where the ball is while a step's dice roll: on a pass or set it has gone to that player at their spot. */
export function rollBall(before: Game, rolls: Roll[], rollPos: Positions, bottom: TeamId = 'A'): Point {
	const touch = rolls.find((r) => r.label === 'set' || r.label === 'pass');
	return touch ? held(zoneCenter(touch.team, rollPos[touch.team][touch.slot], bottom)) : ballRest(before, rollPos, bottom);
}

/** Candidate heights for a callout in the bottom and top halves, net side to baseline (viewBox units). */
const CALLOUT_BANDS = { bottom: [320, 415, 515], top: [240, 145, 45] };

/**
 * Where to put a callout for `team`, as a % of the court's height: the band of their half that is
 * furthest from any player, so the headline never sits on the players who just made the play.
 */
export function calloutTop(team: TeamId, pos: Positions, bottom: TeamId = 'A'): number {
	const chipYs = (['A', 'B'] as const).flatMap((t) =>
		(['blocker', 'defender'] as const).map((slot) => zoneCenter(t, pos[t][slot], bottom).y)
	);
	const clearance = (y: number) => Math.min(...chipYs.map((c) => Math.abs(c - y)));
	const best = CALLOUT_BANDS[team === bottom ? 'bottom' : 'top'].reduce((a, b) => (clearance(b) > clearance(a) ? b : a));
	return (100 * best) / VIEW.height;
}

/**
 * How the latest step sends the ball on its way: a spike or a tip, a serve, or a lob for a pass, a
 * set, an easy ball over or a ball fetched for the next serve.
 */
export function flightKind(g: Game): FlightKind {
	const entries = stepEntries(g);
	const hit = entries.find((e) => e.tag === 'hit' || e.tag === 'swing');
	if (hit) {
		if (entries.some((e) => e.tag === 'accuracy' && e.data?.result === 'easy')) return 'lob';
		const soft = hit.data?.shot === 'tip' || hit.data?.touch === 'tip' || hit.data?.touch === 'roll';
		return soft ? 'tip' : 'spike';
	}
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

/**
 * The ball's path from `from` to `to` drawn up to `t` (0–1) of the way: the arc is a quadratic curve
 * whose control point sits 2 × apex above the midpoint, cut at `t`.
 */
export function arcPath(from: Point, to: Point, apex: number, t = 1): string {
	const control = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - 2 * apex };
	const c = { x: from.x + (control.x - from.x) * t, y: from.y + (control.y - from.y) * t };
	const end = arcPoint(from, to, apex, t);
	return `M ${from.x} ${from.y} Q ${c.x} ${c.y} ${end.x} ${end.y}`;
}
