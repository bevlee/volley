import { randomChoosers, type Choosers } from '../src/lib/engine/choosers';
import { config } from '../src/lib/engine/config';
import { equilibrium, lookahead } from '../src/lib/engine/lookahead';
import { newGame, playGame } from '../src/lib/engine/rally';
import { matchup, pct } from './matchups';

/**
 * Do set tempos and block modes add depth, especially on defence, and how should the read block be
 * tuned? With line needing a ±0 set, compares commit-only blocking (today) with block modes on at a
 * few read tunings:
 *
 * - mixed vs random: what balanced play is worth.
 * - mixed defence vs random: the same, for the defence's calls alone. The number to move.
 * - reader vs smart: how hard a predictable attacker gets punished.
 *
 * then how balanced play mixes block modes by set quality. A read that's never picked is too weak.
 *
 *   npm run sim:blocks -- [games per matchup] [rollouts per cell]
 */
const games = Number(process.argv[2] ?? 200);
const rollouts = Number(process.argv[3] ?? 40);

/** Block modes on or off, the read block's bonus, and the d6 a reader needs to get across against a high set. */
const variants: [string, { modes: boolean; bonus: number; high: number }][] = [
	['commit only (today)', { modes: false, bonus: 2, high: 5 }],
	['read +1, across on 4', { modes: true, bonus: 1, high: 4 }],
	['read +2, across on 4', { modes: true, bonus: 2, high: 4 }],
	['read +1, across on 5', { modes: true, bonus: 1, high: 5 }],
	['read +2, across on 5', { modes: true, bonus: 2, high: 5 }]
];

config.minSet = { line: 0, cross: null, tip: null };
const ai = lookahead(rollouts);
const mixedDefence: Choosers = { ...randomChoosers, block: ai.mixed.block, stance: ai.mixed.stance, blockMode: ai.mixed.blockMode };

/** How balanced play mixes tempo and block mode, by set quality, over the sets of random games. */
function modeMix(seeds: number) {
	const bySet = new Map<number, { calls: number; mix: Record<string, number> }>();
	const recorder: Choosers = {
		...randomChoosers,
		shot: (game, team, rng) => {
			const t = ai.table(game);
			const { attack, defence } = equilibrium(t.payoffs);
			const setMod = game.attack!.setMod!;
			const row = bySet.get(setMod) ?? { calls: 0, mix: { fast: 0, commit: 0, read: 0, none: 0 } };
			row.calls++;
			t.attacks.forEach(({ tempo }, i) => tempo === 'fast' && (row.mix.fast += attack[i]));
			t.defences.forEach(({ blockMode }, j) => (row.mix[blockMode!] += defence[j]));
			bySet.set(setMod, row);
			return randomChoosers.shot(game, team, rng);
		}
	};
	for (let seed = 1; seed <= seeds; seed++) playGame(newGame(seed), recorder);
	return Object.fromEntries(
		[...bySet]
			.sort(([a], [b]) => a - b)
			.map(([mod, { calls, mix }]) => [
				mod > 0 ? `+${mod}` : mod === 0 ? '±0' : String(mod),
				{
					calls,
					'fast set': pct(mix.fast, calls),
					commit: pct(mix.commit, calls),
					read: pct(mix.read, calls),
					'no block': pct(mix.none, calls)
				}
			])
	);
}

const results: Record<string, Record<string, string>> = {};
const mixes: [string, ReturnType<typeof modeMix>][] = [];
for (const [name, { modes, bonus, high }] of variants) {
	config.blockModes = modes;
	config.readBlockBonus = bonus;
	config.readChance = { ...config.readChance, high };
	const vsRandom = matchup(ai.mixed, randomChoosers, games);
	const defence = matchup(mixedDefence, randomChoosers, games);
	const reading = matchup(ai.reader, ai.smart, games);
	results[name] = {
		'mixed vs random: games': vsRandom['games won by first'],
		'· points': vsRandom['points won'],
		'mixed defence vs random: points': defence['points won'],
		'reader vs smart: points': reading['points won']
	};
	if (modes) mixes.push([name, modeMix(Math.min(games, 100))]);
	console.log(`${name} done`);
}

console.log(`\nLine needs ±0 · ${games} games from each side per matchup · ${rollouts} rollouts per cell\n`);
console.table(results);
for (const [name, mix] of mixes) {
	console.log(`Balanced play by set quality · ${name}`);
	console.table(mix);
}
