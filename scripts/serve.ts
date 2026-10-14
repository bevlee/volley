import { randomChoosers, type Choosers } from '../src/lib/engine/choosers';
import { config } from '../src/lib/engine/config';
import { lookahead } from '../src/lib/engine/lookahead';
import { newGame, other, playGame } from '../src/lib/engine/rally';
import type { Shot } from '../src/lib/engine/types';
import { matchup, pct } from './matchups';

/**
 * Do aimed serves add a decision? With serves aimed (the server picks a receiver or the seam, and
 * the pass uses the passer's defense), for each gating:
 *
 * - smart serve, random calls: a side that only serves well, against random.
 * - smart serve, balanced calls: two balanced sides, one serving at random. The serve's worth
 *   between good players.
 * - mixed vs random: what balanced play is worth overall, to set against `npm run sim:gating`.
 *
 * then where the smart server aims at each receiving pair, and how the lineups balance.
 *
 *   npm run sim:serve -- [games per matchup] [rollouts per cell]
 */
const games = Number(process.argv[2] ?? 300);
const rollouts = Number(process.argv[3] ?? 80);

const gatings: [string, Record<Shot, number | null>][] = [
	['no gating', { line: null, cross: null, tip: null }],
	['line needs ±0', { line: 0, cross: null, tip: null }]
];

const ai = lookahead(rollouts);
const smartServeOnly: Choosers = { ...randomChoosers, serve: ai.smart.serve };
const mixedRandomServe: Choosers = { ...ai.mixed, serve: randomChoosers.serve };

config.serveTargets = true;
const results: Record<string, Record<string, string>> = {};
for (const [name, minSet] of gatings) {
	config.minSet = minSet;
	const serveOnly = matchup(smartServeOnly, randomChoosers, games);
	const serveBalanced = matchup(ai.mixed, mixedRandomServe, games);
	const overall = matchup(ai.mixed, randomChoosers, games);
	results[name] = {
		'smart serve, random calls: games': serveOnly['games won by first'],
		'· points': serveOnly['points won'],
		'smart serve, balanced calls: games': serveBalanced['games won by first'],
		'· points ': serveBalanced['points won'],
		'mixed vs random: games': overall['games won by first']
	};
	console.log(`${name} done`);
}

console.log(`\nAimed serves · ${games} games from each side per matchup · ${rollouts} rollouts per cell\n`);
console.table(results);

// Where the smart server aims, by who's receiving. Gating at line ±0, calls random.
config.minSet = { line: 0, cross: null, tip: null };
const aims: Record<string, Record<string, number>> = {};
const recorder: Choosers = {
	...randomChoosers,
	serve: (game, team, rng) => {
		const target = ai.smart.serve!(game, team, rng);
		const receiving = game.teams[other(team)];
		const key = `serving at ${receiving.blocker.name} & ${receiving.defender.name}`;
		aims[key] ??= { [receiving.blocker.name]: 0, [receiving.defender.name]: 0, seam: 0 };
		aims[key][target === 'seam' ? 'seam' : receiving[target].name]++;
		return target;
	}
};
for (let seed = 1; seed <= Math.min(games, 200); seed++) playGame(newGame(seed), recorder);
console.log('Where the smart server aims (line needs ±0)');
console.table(
	Object.fromEntries(
		Object.entries(aims).map(([key, counts]) => {
			const n = Object.values(counts).reduce((a, b) => a + b, 0);
			return [key, Object.fromEntries(Object.entries(counts).map(([k, c]) => [k, pct(c, n)]))];
		})
	)
);

// Passing now uses defense, so the lineups may no longer be even. Random calls, from A's side.
const balance: Record<string, string> = {};
for (const serves of [false, true]) {
	config.serveTargets = serves;
	let a = 0;
	for (let seed = 1; seed <= 4000; seed++) if (playGame(newGame(seed)).winner === 'A') a++;
	balance[serves ? 'aimed serves' : 'serve to the blocker'] = pct(a, 4000);
}
console.log('Team A win rate, all random, line needs ±0 (4,000 games)');
console.table(balance);
