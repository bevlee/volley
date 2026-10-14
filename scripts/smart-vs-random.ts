import { randomChoosers, type Choosers } from '../src/lib/engine/choosers';
import { lookahead } from '../src/lib/engine/lookahead';
import { matchup, shotMix } from './matchups';

/**
 * Do the calls matter, and do they hold up against a good opponent? Plays computer sides that look
 * ahead against each other and against random calls:
 *
 * - random: calls at random.
 * - smart:  the best call against a random side. Predictable: the same set gets the same call.
 * - reader: attacks like smart, and defends knowing smart's habits.
 * - mixed:  the balanced mix of calls that nobody can exploit.
 *
 *   npm run sim:smart -- [games per matchup] [rollouts per cell]
 */
const games = Number(process.argv[2] ?? 300);
const rollouts = Number(process.argv[3] ?? 100);

const ai = lookahead(rollouts);
const sides: Record<string, Choosers> = { random: randomChoosers, smart: ai.smart, reader: ai.reader, mixed: ai.mixed };
const matchups: [string, string][] = [
	['random', 'random'],
	['smart', 'random'],
	['smart', 'smart'],
	['reader', 'smart'],
	['mixed', 'random'],
	['mixed', 'smart'],
	['mixed', 'reader']
];

const rows: Record<string, ReturnType<typeof matchup>> = {};
for (const [first, second] of matchups) {
	rows[`${first} vs ${second}`] = matchup(sides[first], sides[second], games);
	console.log(`${first} vs ${second} done`);
}

console.log(`\n${games} games from each side per matchup · ${rollouts} rollouts per cell\n`);
console.table(rows);
console.log('Balanced shot mix by set quality (set modifier)');
console.table(shotMix(ai, Math.min(games, 200)));
