import { config } from './config';
import { LINEUP, type Character } from './lineup';
import { newGame } from './rally';
import { mulberry32, pick } from './rng';
import type { AbilityId, AttackOption, Game, Slot } from './types';

/**
 * Run mode: five matches against fixed opponents, each attacking in one more way than the last.
 * After every win you pick two abilities and give each to Hinata or Nishinoya; a loss ends the run.
 * See docs/plans/2026-10-14-run-mode-design.md.
 */

export interface Ability {
	id: AbilityId;
	name: string;
	/** When it works: whenever its player is in this role. */
	role: string;
	/** Who it suits in the starting pair, for the pick screen. */
	suits: string;
	/** What it does, for the pick screen. */
	text: string;
}

const a = config.abilities;
/** A number for the pick screen, with a real minus sign. */
const num = (n: number) => (n < 0 ? `−${-n}` : `${n}`);

/**
 * Each bends one rule for its player, worth roughly 2 to 4 points in 100 where it suits (measured with
 * the sim). None needs another, and none takes an option away: costs are numbers, not lost choices.
 */
export const ABILITIES: Record<AbilityId, Ability> = {
	tip: { id: 'tip', name: 'Tip', role: 'Hitting', suits: 'Hinata', text: 'Can tip it over the block.' },
	quick: {
		id: 'quick',
		name: 'Quick',
		role: 'Hitting',
		suits: 'Hinata',
		text: `Can hit quick sets, line or cross, off a set of ±0 or better: hard to read, +${a.quickPower} power, and no aim penalty (others aim quicks at ${num(config.fastAccuracyMod)}).`
	},
	lineSpecialist: {
		id: 'lineSpecialist',
		name: 'Line specialist',
		role: 'Hitting',
		suits: 'Hinata',
		text: `Hits line off a set ${a.lineSpecialistSets} worse than anyone else, with +${a.lineSpecialistPower} power.`
	},
	heavyHitter: {
		id: 'heavyHitter',
		name: 'Heavy hitter',
		role: 'Hitting',
		suits: 'Hinata',
		text: `+${a.heavyHitterPower} power on line and cross, ${num(a.heavyHitterAim)} to aim.`
	},
	toolTheBlock: {
		id: 'toolTheBlock',
		name: 'Tool the block',
		role: 'Hitting',
		suits: 'Hinata',
		text: `When the block only gets a touch, a ${a.toolTheBlockOn} or more knocks it off the hands and out: point.`
	},
	wall: { id: 'wall', name: 'Wall', role: 'Blocking', suits: 'Hinata', text: `+${a.wallBlock} to committed blocks.` },
	softBlock: {
		id: 'softBlock',
		name: 'Soft block',
		role: 'Blocking',
		suits: 'Hinata',
		text: `Block touches go up to the setter: +${a.softBlockTouch} as a first touch instead of ${num(config.touchFirstMod)}.`
	},
	steadyPasser: {
		id: 'steadyPasser',
		name: 'Steady passer',
		role: 'Passing',
		suits: 'Hinata',
		text: `+${a.steadyPass} to pass rolls: better passes, better sets.`
	},
	liberoInstincts: {
		id: 'liberoInstincts',
		name: 'Libero instincts',
		role: 'Digging',
		suits: 'Nishinoya',
		text: `+${a.liberoDig} to digs, and a dig that comes up is one grade better as a first touch.`
	},
	pancake: {
		id: 'pancake',
		name: 'Pancake',
		role: 'Digging',
		suits: 'Nishinoya',
		text: 'Digs a ball one zone away with full reach.'
	},
	settersTouch: {
		id: 'settersTouch',
		name: "Setter's touch",
		role: 'Setting',
		suits: 'Nishinoya',
		text: `Set rolls of ${a.settersTouchFrom} or ${a.settersTouchFrom + 1} count one higher: more great sets.`
	}
};

export interface Opponent {
	team: string;
	blocker: Character;
	defender: Character;
	playbook: AttackOption[];
	/** The attack this opponent adds to the last one's, for the match intro. */
	adds: string;
	/** What it asks of you. */
	lesson: string;
}

const over: AttackOption = { shot: 'over', tempo: 'high' };
const highCross: AttackOption = { shot: 'cross', tempo: 'high' };
const highLine: AttackOption = { shot: 'line', tempo: 'high' };
const quickCross: AttackOption = { shot: 'cross', tempo: 'fast' };
const quickLine: AttackOption = { shot: 'line', tempo: 'fast' };

/**
 * The five opponents, in order. Each attacks in every way the one before did, and one more. Stats
 * tuned with `npm run sim:run` for a balanced player winning about 100%, 92%, 76%, 56% and 49%: a run
 * won about a fifth of the time by perfect play, less by a person.
 */
export const OPPONENTS: Opponent[] = [
	{
		team: 'Nekoma',
		blocker: { name: 'Kenma', attack: 3, defense: 3 },
		defender: { name: 'Yaku', attack: 1, defense: 6 },
		playbook: [over],
		adds: 'They never swing: every ball is dug over deep.',
		lesson: 'Play deep to get their ball up, then win the points on your own attack.'
	},
	{
		team: 'Date Tech',
		blocker: { name: 'Aone', attack: 3, defense: 3 },
		defender: { name: 'Futakuchi', attack: 3, defense: 3 },
		playbook: [over, highCross],
		adds: 'High balls hit cross-court.',
		lesson: 'Commit the block to cross, and watch for the deep ball.'
	},
	{
		team: 'Aoba Johsai',
		blocker: { name: 'Iwaizumi', attack: 3, defense: 4 },
		defender: { name: 'Oikawa', attack: 5, defense: 3 },
		playbook: [over, highCross, highLine],
		adds: 'High balls down the line too.',
		lesson: 'Line or cross: now you have to guess, or read the high set.'
	},
	{
		team: 'Inarizaki',
		blocker: { name: 'Osamu', attack: 4, defense: 5 },
		defender: { name: 'Atsumu', attack: 5, defense: 3 },
		playbook: [over, highCross, highLine, quickCross],
		adds: 'A quick set hit cross.',
		lesson: 'Reading is too slow for a quick: commit, or leave it to the dig.'
	},
	{
		team: 'Shiratorizawa',
		blocker: { name: 'Tendou', attack: 4, defense: 6 },
		defender: { name: 'Ushijima', attack: 6, defense: 3 },
		playbook: [over, highCross, highLine, quickCross, quickLine],
		adds: 'Quick sets down the line too: everything.',
		lesson: 'All of it, against the strongest hitter in the run.'
	}
];

export type RunStatus = 'playing' | 'picking' | 'lost' | 'won';

export interface Run {
	seed: number;
	/** The match being played or just played: 0 to 4. */
	match: number;
	/** Each of your players' abilities. */
	abilities: Record<Slot, AbilityId[]>;
	status: RunStatus;
	/** The two abilities on offer after a win, while picking. */
	offer: AbilityId[];
}

/** The rules a run plays by: set tempos and block modes on, line needs a ±0 set, no charges or aimed serves. */
export function useRunRules() {
	config.blockModes = true;
	config.minSet = { line: 0 };
	config.specials = false;
	config.serveTargets = false;
}

export const newRun = (seed: number): Run => ({
	seed,
	match: 0,
	abilities: { blocker: [], defender: [] },
	status: 'playing',
	offer: []
});

/** This match's game: your pair (with their abilities and the run kit) against this match's opponent. */
export function matchGame(run: Run): Game {
	const opponent = OPPONENTS[run.match];
	const g = newGame(run.seed + run.match * 7919, {
		A: LINEUP.A,
		B: { blocker: opponent.blocker, defender: opponent.defender }
	});
	g.teams.A.runKit = true;
	for (const slot of ['blocker', 'defender'] as const) g.teams.A[slot].abilities = [...run.abilities[slot]];
	g.teams.B.playbook = opponent.playbook;
	return g;
}

/** Whether `slot` can take `ability`: they don't have it yet. */
export const canTake = (run: Run, slot: Slot, ability: AbilityId) => !run.abilities[slot].includes(ability);

/** Two different abilities that at least one of your players can still take, drawn from the run's seed. */
export function offer(run: Run): AbilityId[] {
	const rng = mulberry32(run.seed * 31 + run.match);
	const open = (Object.keys(ABILITIES) as AbilityId[]).filter((id) => canTake(run, 'blocker', id) || canTake(run, 'defender', id));
	const picked: AbilityId[] = [];
	while (picked.length < 2 && picked.length < open.length) {
		const next = pick(rng, open.filter((id) => !picked.includes(id)));
		picked.push(next);
	}
	return picked;
}

/** After a match: a loss ends the run, a win in the last match wins it, any other win offers two abilities. */
export function finishMatch(run: Run, won: boolean): Run {
	if (!won) return { ...run, status: 'lost' };
	if (run.match === OPPONENTS.length - 1) return { ...run, status: 'won' };
	return { ...run, status: 'picking', offer: offer(run) };
}

/**
 * Gives each offered ability to the player chosen for it (both may go to one player), and moves on to
 * the next match. An ability the player already has is refused.
 */
export function choose(run: Run, picks: { ability: AbilityId; slot: Slot }[]): Run {
	if (run.status !== 'picking') throw new Error('Nothing to pick');
	let next: Run = { ...run, abilities: { blocker: [...run.abilities.blocker], defender: [...run.abilities.defender] } };
	for (const { ability, slot } of picks) {
		if (!run.offer.includes(ability)) throw new Error(`${ability} isn't on offer`);
		if (!canTake(next, slot, ability)) throw new Error(`${slot} can't take ${ability}`);
		next = { ...next, abilities: { ...next.abilities, [slot]: [...next.abilities[slot], ability] } };
	}
	return { ...next, match: run.match + 1, status: 'playing', offer: [] };
}
