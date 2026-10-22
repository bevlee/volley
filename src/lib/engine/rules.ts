import { config } from './config';
import type { AbilityId, AimResult, AttackOption, BlockMode, BlockResult, Calls, Channel, DefenceSpecial, Game, Player, ReadOutcome, Shot, Slot, Stance, Team, TeamId, Tempo, Touch, Zone } from './types';

export const ZONES: readonly Zone[] = [1, 2, 3, 4, 5, 6];
/** The shots of a normal game. A dig over (`over`) is run mode only. */
export const SHOTS: readonly Shot[] = ['line', 'cross', 'tip'];
const CHANNELS: readonly Channel[] = ['line', 'cross'];
const TOUCHES: readonly Touch[] = ['hard', 'tip', 'roll'];
const STANCES: readonly Stance[] = ['deep', 'short'];
const TEMPOS: readonly Tempo[] = ['fast', 'high'];
const BLOCK_MODES: readonly BlockMode[] = ['commit', 'read', 'none'];

export const has = (player: Player, ability: AbilityId) => player.abilities?.includes(ability) ?? false;

/** A soft shot goes over the block rather than through it: a tip, a roll, or a dig over. */
export const isSoft = (shot: Shot | Touch) => shot === 'tip' || shot === 'roll' || shot === 'over';

/** Advanced mode is on for this team's attacks: a normal game's team (run mode keeps its own attacks). */
export function advancedFor(team: Team): boolean {
	if (!config.advanced || team.runKit || team.playbook) return false;
	if (config.blockModes) throw new Error('advanced mode sets its own tempo: turn off block modes');
	return true;
}

export const tempoOf = (setMod: number): Tempo => (setMod >= config.quickBallMinSet ? 'fast' : 'high');

/** The tempo the set left the side attacking now, in advanced mode. */
export function tempoIn(g: Game): Tempo | undefined {
	const a = g.attack!;
	return advancedFor(g.teams[a.team]) ? tempoOf(a.setMod!) : undefined;
}

/** The defender's options: none against a quick ball, which leaves them no time to move. */
export const stancesIn = (g: Game): Stance[] => (tempoIn(g) === 'fast' ? [] : [...STANCES]);

function advancedOptions(setMod: number): AttackOption[] {
	const tempo = tempoOf(setMod);
	if (tempo === 'fast') return CHANNELS.map((shot) => ({ shot, tempo, touch: 'hard' }));
	return CHANNELS.flatMap((shot) =>
		TOUCHES.filter((touch) => setMod >= (config.highBallMinSet[shot][touch] ?? -Infinity)).map((touch) => ({ shot, tempo, touch }))
	);
}

/** The shots on off a set this good: each needs at least its `config.minSet`. */
export const availableShots = (setMod: number): Shot[] =>
	SHOTS.filter((shot) => setMod >= (config.minSet[shot] ?? -Infinity));

/** The blocks worth making off this set: the channels of the hard shots still on, or either when none are. */
export function availableBlocks(setMod: number): Channel[] {
	return blocksAgainst(availableShots(setMod));
}

function blocksAgainst(shots: Shot[]): Channel[] {
	const open = CHANNELS.filter((channel) => shots.includes(channel));
	return open.length ? open : [...CHANNELS];
}

/**
 * Every attack `hitter` can make off a set this good. A normal game has every shot the set leaves on
 * (and every tempo, when tempos are in play). In run mode an opponent attacks only from its playbook,
 * and the player's team from the run kit (high line and cross, and dig over) plus abilities: Tip,
 * Quick. Either way line needs a good enough set (Line specialist: one worse), and a quick set a good
 * one. A dig over is always on.
 */
export function attackOptions(team: Team, hitter: Player, setMod: number): AttackOption[] {
	if (advancedFor(team)) return advancedOptions(setMod);
	if (!team.playbook && !team.runKit) {
		const tempos: (Tempo | undefined)[] = config.blockModes ? [...TEMPOS] : [undefined];
		return availableShots(setMod).flatMap((shot) => tempos.map((tempo) => ({ shot, tempo })));
	}
	const kit: AttackOption[] = team.playbook ?? [
		{ shot: 'line', tempo: 'high' },
		{ shot: 'cross', tempo: 'high' },
		...(has(hitter, 'tip') ? [{ shot: 'tip' as const, tempo: 'high' as const }] : []),
		...(has(hitter, 'quick')
			? [
					{ shot: 'line' as const, tempo: 'fast' as const },
					{ shot: 'cross' as const, tempo: 'fast' as const }
				]
			: [])
	];
	const lineMin = (config.minSet.line ?? -Infinity) - (has(hitter, 'lineSpecialist') ? config.abilities.lineSpecialistSets : 0);
	const quickMin = config.quickMinSet;
	const open = kit.filter(
		({ shot, tempo }) => (shot !== 'line' || setMod >= lineMin) && (tempo !== 'fast' || setMod >= quickMin) && shot !== 'over'
	);
	return [...open, { shot: 'over', tempo: 'high' }];
}

/** The attacks open to the side attacking now. */
export function attackOptionsIn(g: Game): AttackOption[] {
	const a = g.attack!;
	const team = g.teams[a.team];
	return attackOptions(team, team[a.hitter], a.setMod!);
}

/** The blocks worth making against the side attacking now: the channels of its hard shots, or either. */
export const blocksIn = (g: Game): Channel[] => blocksAgainst(attackOptionsIn(g).map((o) => o.shot));

/** How the defending blocker can play it. Every mode, for now: no ability takes one away. */
export function blockModesFor(_blocker: Player): BlockMode[] {
	return [...BLOCK_MODES];
}

/**
 * How the defending blocker can play the attack now: every mode, with block modes on; in advanced
 * mode with `config.stayDown`, block or stay down against a high ball. Empty when there's no call.
 */
export function blockModesIn(g: Game): BlockMode[] {
	const rival = g.attack!.team === 'A' ? 'B' : 'A';
	if (config.blockModes) return blockModesFor(g.teams[rival].blocker);
	return config.stayDown && tempoIn(g) === 'high' ? ['commit', 'none'] : [];
}

/** Row and column of each zone from the team's own view: front row 4-3-2, back row 5-6-1. */
export const GRID: Record<Zone, readonly [row: number, col: number]> = {
	4: [0, 0],
	3: [0, 1],
	2: [0, 2],
	5: [1, 0],
	6: [1, 1],
	1: [1, 2]
};

/** Attacks always come from the attacker's left, so on the defending side line is zone 1 and cross is zone 5. A dig over goes deep middle. */
export const TARGET: Record<Shot, Zone> = { line: 1, cross: 5, tip: 3, over: 6 };

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

/** Where a defending side can spend a charge: on the block if the blocker has one, the dig if the defender has one, or not at all. */
export function availableSpends(pips: Record<Slot, number>): DefenceSpecial[] {
	return ['none', ...(pips.blocker > 0 ? ['block' as const] : []), ...(pips.defender > 0 ? ['dig' as const] : [])];
}

/** Charges a first touch (pass or dig) earns: 1 for a great one (+1), 2 for a perfect one (+2). */
export const firstTouchPips = (mod: number) => Math.max(0, mod);

/** Charges a set earns: 1 for a great one, the top of the ladder. */
export const setPips = (mod: number) => (mod >= 2 ? 1 : 0);

/** A serve's pass: the die plus the passer's defense over 4 (and less in the seam), read off the same table. */
export const servePass = (die: number, defense: number, seam: boolean) =>
	firstTouch(Math.min(6, Math.max(1, die + defense - 4 + (seam ? config.seamPassMod : 0))));

export const power = (attack: number, die: number, setMod: number) => attack + die + setMod;

/** Advanced mode: what a touch's power takes from the set. */
export const touchSet = (touch: Touch, setMod: number) => config.touchPower[touch].set * setMod + config.touchPower[touch].bonus;

/** Advanced mode: what a touch's aim takes from the set. */
export const touchAim = (touch: Touch, setMod: number) => config.touchAim[touch].set * setMod + config.touchAim[touch].bonus;

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
export function aimResult(shot: Shot | Touch, acc: number): AimResult {
	if (acc <= config.accuracyEasy) return 'easy';
	if (acc >= config.accuracyExact) return 'exact';
	return !isSoft(shot) && acc <= config.accuracyIntoBlock ? 'block' : 'drift';
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

/** Advanced mode: where each shot lands if it's on target. */
export const LANDING: Record<Channel, Record<Touch, Zone>> = {
	line: { hard: 1, tip: 2, roll: 1 },
	cross: { hard: 5, tip: 4, roll: 5 }
};

/** Advanced mode: the defender plays the corner of the channel the block leaves open, deep or short. */
export const CORNER: Record<Channel, Record<Stance, Zone>> = {
	line: { deep: 5, short: 4 },
	cross: { deep: 1, short: 2 }
};

const READ_OUTCOMES: readonly ReadOutcome[] = ['read', 'close', 'wrong'];
const CORNERS: readonly Zone[] = [1, 2, 4, 5];

/** Advanced mode: the defender's corner against the ball's. Off in depth or in side is close; off in both is wrong. */
export const readOutcome = (defender: Zone, ball: Zone): ReadOutcome => READ_OUTCOMES[misses(defender, ball)];

/** How many of row and column two zones differ in. */
function misses(a: Zone, b: Zone): number {
	const [ra, ca] = GRID[a];
	const [rb, cb] = GRID[b];
	return Number(ra !== rb) + Number(ca !== cb);
}

export const targetOf = (calls: Calls): Zone => (calls.touch ? LANDING[calls.shot as Channel][calls.touch] : TARGET[calls.shot]);

export const defenderAt = (calls: Calls): Zone =>
	calls.touch ? CORNER[calls.block][calls.stance] : defenderZone(calls.stance, calls.block);

/**
 * Advanced mode: where a high ball lands. A drifting shot drifts toward the defender, to a corner one
 * step closer to them (onto them, from a close read).
 */
export function advancedLanding(calls: Calls, acc: number, pickTie: (zones: Zone[]) => Zone): Zone | 'easy' {
	const result = aimResult(calls.touch!, acc);
	if (result === 'easy') return 'easy';
	const target = targetOf(calls);
	const defender = defenderAt(calls);
	if (result !== 'drift' || target === defender) return target;
	const closer = CORNERS.filter((z) => misses(z, target) === 1 && misses(z, defender) < misses(target, defender));
	return closer.length === 1 ? closer[0] : pickTie(closer);
}

/** A short defender reads a tip; a deep one reads a dig over, and the hard shot their blocker leaves open. */
export const isRead = (shot: Shot, block: Channel, stance: Stance) =>
	shot === 'tip' ? stance === 'short' : shot === 'over' ? stance === 'deep' : stance === 'deep' && shot !== block;

export function blockResult(block: number, attack: number): BlockResult {
	if (block - attack >= config.blockMargin) return 'stuff';
	if (attack - block >= config.blockMargin) return 'clean';
	return 'touch';
}

/**
 * A dig over drops deep: a defender playing deep is there (full reach), one playing short has to turn
 * and chase it (the longest reach), wherever exactly it lands.
 */
export const overReach = (stance: Stance) => (stance === 'deep' ? config.reach[0] : config.reach[config.reach.length - 1]);

/** Pancake (run mode) gets to a ball one zone away better. */
export const reach = (dist: number, digger?: Player) =>
	dist === 1 && digger && has(digger, 'pancake') ? config.abilities.pancakeReach : config.reach[Math.min(dist, config.reach.length - 1)];

/**
 * How well the defender gets to a ball landing here: their reach and their bonus for reading it. In
 * advanced mode both come from the read outcome; otherwise from the distance and whether it was read.
 */
export function digEffect(calls: Calls, ball: Zone, digger: Player): { reach: number; bonus: number; outcome: ReadOutcome } {
	if (calls.touch) {
		const outcome = calls.blockMode === 'none' ? 'close' : readOutcome(defenderAt(calls), ball);
		return { ...config.tempoDig[outcome], outcome };
	}
	const read = isRead(calls.shot, calls.block, calls.stance);
	return {
		reach: calls.shot === 'over' ? overReach(calls.stance) : reach(distance(defenderAt(calls), ball), digger),
		bonus: read ? config.readBonus : 0,
		outcome: read ? 'read' : 'wrong'
	};
}

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
