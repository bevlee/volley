import { randomChoosers, type Choosers } from '../src/lib/engine/choosers';
import { config } from '../src/lib/engine/config';
import { lookahead } from '../src/lib/engine/lookahead';
import type { Shot } from '../src/lib/engine/types';
import { matchup, shotMix } from './matchups';

/**
 * Does gating shots by set quality add depth? For each set of cut-offs, measures:
 *
 * - mixed vs random: what balanced play is worth. Higher means the calls matter more.
 * - mixed defence vs random: the same, for the defence's calls alone (the attack calls at random).
 * - reader vs smart: how hard a predictable attacker gets punished.
 *
 * and how balanced play mixes its shots. Line and cross splitting evenly means they're one shot.
 *
 *   npm run sim:gating -- [games per matchup] [rollouts per cell]
 */
const games = Number(process.argv[2] ?? 300);
const rollouts = Number(process.argv[3] ?? 80);

/** Set modifiers run −4, −3, −2, −1, ±0 and +2. */
const variants: [string, Record<Shot, number | null>][] = [
	['all shots always on', { line: null, cross: null, tip: null }],
	['line needs ±0', { line: 0, cross: null, tip: null }],
	['line needs +2', { line: 2, cross: null, tip: null }],
	['line +2, cross −1 (bad sets: tip only)', { line: 2, cross: -1, tip: null }]
];

const ai = lookahead(rollouts);
const mixedDefence: Choosers = { ...randomChoosers, block: ai.mixed.block, stance: ai.mixed.stance, blockMode: ai.mixed.blockMode };

const results: Record<string, Record<string, string>> = {};
const mixes: [string, ReturnType<typeof shotMix>][] = [];
for (const [name, minSet] of variants) {
	config.minSet = minSet;
	const vsRandom = matchup(ai.mixed, randomChoosers, games);
	const defence = matchup(mixedDefence, randomChoosers, games);
	const reading = matchup(ai.reader, ai.smart, games);
	results[name] = {
		'mixed vs random: games': vsRandom['games won by first'],
		'· points': vsRandom['points won'],
		'mixed defence vs random: points': defence['points won'],
		'reader vs smart: points': reading['points won']
	};
	mixes.push([name, shotMix(ai, Math.min(games, 200))]);
	console.log(`${name} done`);
}

console.log(`\n${games} games from each side per matchup · ${rollouts} rollouts per cell\n`);
console.table(results);
for (const [name, mix] of mixes) {
	console.log(`Balanced shot mix by set quality · ${name}`);
	console.table(mix);
}
