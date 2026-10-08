import { config } from './config';
import type { AimResult, BlockResult, Channel, Shot, Stance, TeamId, Zone } from './types';

export const ZONES: readonly Zone[] = [1, 2, 3, 4, 5, 6];

/** Row and column of each zone from the team's own view: front row 4-3-2, back row 5-6-1. */
export const GRID: Record<Zone, readonly [row: number, col: number]> = {
	4: [0, 0],
	3: [0, 1],
	2: [0, 2],
	5: [1, 0],
	6: [1, 1],
	1: [1, 2]
};

/** Attacks always come from the attacker's left, so on the defending side line is zone 1 and cross is zone 5. */
export const TARGET: Record<Shot, Zone> = { line: 1, cross: 5, tip: 3 };

export function ladder(total: number): number {
	if (total >= 6) return 2;
	if (total >= 4) return 0;
	if (total === 3) return -1;
	if (total === 2) return -2;
	return total - 4;
}

/** The first touch's bonus from the pass or dig roll alone: softer than the set's ladder, and neutral on average. */
const FIRST_TOUCH = [-2, -1, 0, 0, 1, 2];
export const firstTouch = (die: number) => FIRST_TOUCH[die - 1];

export const power = (attack: number, die: number, setMod: number) => attack + die + setMod;

/** The setter's share of a hard attack: half their attack stat plus their set die, so a good set hits harder. */
export const teamAttack = (power: number, setterAttack: number, setDie: number) =>
	config.partnerPoolOnAttack ? power + Math.floor((setterAttack + setDie) / 2) : power;

export const accuracy = (die: number, firstMod: number, setMod: number, setterAttack: number) =>
	die + firstMod + setMod + setterAttack;

export function distance(a: Zone, b: Zone): number {
	const [ra, ca] = GRID[a];
	const [rb, cb] = GRID[b];
	return Math.abs(ra - rb) + Math.abs(ca - cb);
}

export const adjacent = (zone: Zone) => ZONES.filter((z) => distance(zone, z) === 1);

/** Deep covers the hard shot the blocker leaves open; short reads the tip. */
export function defenderZone(stance: Stance, block: Channel): Zone {
	if (stance === 'short') return TARGET.tip;
	return block === 'line' ? TARGET.cross : TARGET.line;
}

/**
 * How well an attack was aimed. A hard shot aimed badly goes straight into the block, whichever
 * channel the blocker took; a tip goes over the block, so it only drifts.
 */
export function aimResult(shot: Shot, acc: number): AimResult {
	if (acc <= config.accuracyEasy) return 'easy';
	if (acc >= config.accuracyExact) return 'exact';
	return shot !== 'tip' && acc <= config.accuracyIntoBlock ? 'block' : 'drift';
}

/**
 * Where the ball lands. A drifting shot drifts toward the defender: to the target's neighbour closest
 * to them, or onto them if they're already on the target (they read the shot, and a bad hit shouldn't
 * pull the ball away from them). A shot into the block stays on its target, for if it gets through.
 */
export function landing(
	shot: Shot,
	acc: number,
	defender: Zone,
	pickTie: (zones: Zone[]) => Zone
): Zone | 'easy' {
	const result = aimResult(shot, acc);
	if (result === 'easy') return 'easy';
	const target = TARGET[shot];
	if (result !== 'drift' || defender === target) return target;
	const options = adjacent(target);
	const best = Math.min(...options.map((z) => distance(z, defender)));
	const closest = options.filter((z) => distance(z, defender) === best);
	return closest.length === 1 ? closest[0] : pickTie(closest);
}

export const isRead = (shot: Shot, block: Channel, stance: Stance) =>
	shot === 'tip' ? stance === 'short' : stance === 'deep' && shot !== block;

export function blockResult(block: number, attack: number): BlockResult {
	if (block - attack >= config.blockMargin) return 'stuff';
	if (attack - block >= config.blockMargin) return 'clean';
	return 'touch';
}

export const reach = (dist: number) => config.reach[Math.min(dist, config.reach.length - 1)];

export const digTotal = (defense: number, reach: number, die: number, read: boolean) =>
	Math.floor(defense * reach) + die + (read ? config.readBonus : 0);

export const isShank = (previousDie: number, die: number) => previousDie === 1 && die === 1;

export const isGuaranteedKill = (setDie: number, powerDie: number) => setDie === 6 && powerDie === 6;

export function gameWinner(score: Record<TeamId, number>): TeamId | null {
	for (const [team, rival] of [
		['A', 'B'],
		['B', 'A']
	] as const) {
		if (score[team] >= config.targetScore && score[team] - score[rival] >= config.winBy) return team;
	}
	return null;
}
