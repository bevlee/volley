import { randomChoosers, type Choosers } from '../src/lib/engine/choosers';
import { config } from '../src/lib/engine/config';
import { LINEUP } from '../src/lib/engine/lineup';
import { lookahead } from '../src/lib/engine/lookahead';
import { newGame, playGame } from '../src/lib/engine/rally';
import type { Channel, Game, Touch } from '../src/lib/engine/types';
import { matchup, pct } from './matchups';

/**
 * Advanced mode (tempo flow) against today's rules. For each variant, under balanced play on both
 * sides (the lookahead's equilibrium mix):
 *
 * - kill rate: the share of attacks that win the point outright (a kill or a guaranteed kill, before
 *   the next attack), split by the set: a quick ball (a set of `quickBallMinSet` or better; today,
 *   just a great set) or a high ball (anything worse).
 * - rallies past one attack: the share of rallies with a second attack in them.
 * - A's games: the default lineup, balanced against balanced.
 *
 * and the depth measures, each against random calls:
 *
 * - mixed vs random: what balanced play is worth.
 * - mixed defence vs random: the same, for the defence's calls alone. Against a random attack in
 *   advanced mode this sits near 50% by design: every shot has one read, two closes and one wrong,
 *   so no defence call is better than another until the set takes shots away.
 * - reader vs smart: what defending against a predictable attacker's habits is worth.
 *
 *   npm run sim:tempo -- [games per matchup] [rollouts per cell] [variant names...]
 */
const games = Number(process.argv[2] ?? 200);
const rollouts = Number(process.argv[3] ?? 40);
const only = process.argv.slice(4);

type MinSets = Record<Channel, Record<Touch, number | null>>;
const minSets = (hard: number | null, lineRoll: number | null, crossRoll = lineRoll): MinSets => ({
	line: { hard, tip: null, roll: lineRoll },
	cross: { hard, tip: null, roll: crossRoll }
});

/** Each variant changes advanced mode's defaults (or turns it off). */
const variants: [string, () => void][] = [
	['today', () => (config.advanced = false)],
	[
		'as briefed',
		() => {
			config.quickBlockBonus = 3;
			config.tempoDig = { read: { reach: 1, bonus: 3 }, close: { reach: 0.5, bonus: 1 }, wrong: { reach: 0.25, bonus: 0 } };
			config.highBallMinSet = minSets(null, null);
		}
	],
	['all open', () => (config.highBallMinSet = minSets(null, null))],
	['hard ≥ −2', () => (config.highBallMinSet = minSets(-2, null))],
	['hard ≥ −1, roll ≥ −3', () => (config.highBallMinSet = minSets(-1, -3))],
	['hard ≥ ±0, roll ≥ −2', () => (config.highBallMinSet = minSets(0, -2))],
	['hard ≥ −1, line roll ≥ −2', () => (config.highBallMinSet = minSets(-1, -2, null))],
	['default', () => {}],
	['quick block +6', () => (config.quickBlockBonus = 6)],
	['quick block +10', () => (config.quickBlockBonus = 10)],
	['read +2', () => (config.tempoDig = { ...config.tempoDig, read: { reach: 1, bonus: 2 } })],
	['read +2, close +0', () => (config.tempoDig = { ...config.tempoDig, read: { reach: 1, bonus: 2 }, close: { reach: 0.25, bonus: 0 } })],
	['Kageyama defense 3', () => (LINEUP.B.defender.defense = 3)]
];

const lineup = structuredClone(LINEUP);
const defaults = structuredClone(config);
const ai = lookahead(rollouts);
const mixedDefence: Choosers = { ...randomChoosers, block: ai.mixed.block, stance: ai.mixed.stance };

/** Kill rates, rally length and A's games, from the logs of balanced games. */
function balanced() {
	const attacks = { quick: { n: 0, kills: 0 }, high: { n: 0, kills: 0 } };
	let rallies = 0;
	let long = 0;
	let wonByA = 0;
	for (let seed = 1; seed <= games; seed++) {
		const g: Game = playGame(newGame(seed), ai.mixed);
		if (g.winner === 'A') wonByA++;
		let setMod = 0;
		let open: { team: unknown; tempo: 'quick' | 'high' } | null = null;
		const perRally = new Map<number, number>();
		for (const e of g.log) {
			if (e.tag === 'set') setMod = Number(e.data!.mod);
			if (e.tag === 'calls') {
				open = { team: e.data!.team, tempo: setMod >= config.quickBallMinSet ? 'quick' : 'high' };
				attacks[open.tempo].n++;
				perRally.set(e.rally, (perRally.get(e.rally) ?? 0) + 1);
			}
			if (e.tag === 'point' && open) {
				const { winner, kind } = e.data!;
				if (winner === open.team && (kind === 'kill' || kind === 'guaranteed kill')) attacks[open.tempo].kills++;
			}
			if (e.tag === 'point' || e.tag === 'freeBall') open = null;
		}
		rallies += g.rally;
		long += [...perRally.values()].filter((n) => n > 1).length;
	}
	return {
		'quick kills': `${pct(attacks.quick.kills, attacks.quick.n)} of ${attacks.quick.n}`,
		'high kills': `${pct(attacks.high.kills, attacks.high.n)} of ${attacks.high.n}`,
		'past one attack': `${pct(long, rallies)} of ${rallies}`,
		"A's games": pct(wonByA, games)
	};
}

const results: Record<string, Record<string, string>> = {};
for (const [name, apply] of variants) {
	if (only.length && !only.includes(name)) continue;
	Object.assign(config, structuredClone(defaults), { advanced: true });
	Object.assign(LINEUP, structuredClone(lineup));
	apply();
	const started = performance.now();
	const play = balanced();
	const vsRandom = matchup(ai.mixed, randomChoosers, games);
	const defence = matchup(mixedDefence, randomChoosers, games);
	const reading = matchup(ai.reader, ai.smart, games);
	results[name] = {
		...play,
		'mixed vs random: games': vsRandom['games won by first'],
		'· points': vsRandom['points won'],
		'mixed defence vs random: points': defence['points won'],
		'reader vs smart: points': reading['points won'],
		seconds: ((performance.now() - started) / 1000).toFixed(0)
	};
	console.log(`${name} done`);
}

console.log(`\n${games} games per matchup (from each side against random) · ${rollouts} rollouts per cell\n`);
console.table(results);
