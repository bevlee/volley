import { randomChoosers, type Choosers } from '../src/lib/engine/choosers';
import { config } from '../src/lib/engine/config';
import { equilibrium, lookahead } from '../src/lib/engine/lookahead';
import { newGame, playGame } from '../src/lib/engine/rally';
import { availableSpends } from '../src/lib/engine/rules';
import { matchup, pct } from './matchups';

/**
 * Do special charges add a decision? Each player earns their own (up to 4) and spends them on their
 * own hit, block or dig. With line needing a ±0 set (commit-only blocking, to keep the
 * tables small), measures:
 *
 * - mixed vs random, with charges off and on: what balanced play is worth.
 * - mixed vs always-spend: balanced play against the same play that spends every charge at once.
 *   If this is near 50%, when to spend isn't a decision.
 * - mixed vs never-spend: what the charges are worth at all.
 *
 * then how the meter runs in balanced play (gained, wasted at the cap, spent), and how balanced
 * play spends by set quality.
 *
 *   npm run sim:specials -- [games per matchup] [rollouts per cell]
 */
const games = Number(process.argv[2] ?? 300);
const rollouts = Number(process.argv[3] ?? 40);

config.minSet = { line: 0, cross: null, tip: null };
const ai = lookahead(rollouts);
const alwaysSpend: Choosers = {
	...ai.mixed,
	special: () => true,
	// Spends whatever its blocker or digger has, preferring balanced play's pick when it spends at all.
	defenceSpecial: (game, team, rng) => {
		const spend = ai.mixed.defenceSpecial!(game, team, rng);
		return spend !== 'none' ? spend : availableSpends(game.pips![team]).at(-1)!;
	}
};
const neverSpend: Choosers = { ...ai.mixed, special: () => false, defenceSpecial: () => 'none' };

const results: Record<string, Record<string, string>> = {};
config.specials = false;
results['mixed vs random, charges off'] = matchup(ai.mixed, randomChoosers, games);
console.log('charges off done');
config.specials = true;
results['mixed vs random, charges on'] = matchup(ai.mixed, randomChoosers, games);
console.log('charges on done');
results['mixed vs always-spend'] = matchup(ai.mixed, alwaysSpend, games);
console.log('always-spend done');
results['mixed vs never-spend'] = matchup(ai.mixed, neverSpend, games);
console.log('never-spend done');

console.log(`\nLine needs ±0 · ${games} games from each side per matchup · ${rollouts} rollouts per cell\n`);
console.table(Object.fromEntries(Object.entries(results).map(([k, r]) => [k, { games: r['games won by first'], points: r['points won'] }])));

// How the meter runs, and how balanced play spends, in balanced-vs-balanced games.
const meter = { gained: 0, wasted: 0, attack: 0, block: 0, dig: 0 };
const bySet = new Map<number, { attackCalls: number; attack: number; defenceCalls: number; block: number; dig: number }>();
const recorder: Choosers = {
	...ai.mixed,
	shot: (game, team, rng) => {
		const t = ai.table(game);
		const { attack, defence } = equilibrium(t.payoffs);
		const setMod = game.attack!.setMod!;
		const row = bySet.get(setMod) ?? { attackCalls: 0, attack: 0, defenceCalls: 0, block: 0, dig: 0 };
		if (t.attacks.some((a) => a.special !== undefined)) {
			row.attackCalls++;
			t.attacks.forEach((a, i) => a.special && (row.attack += attack[i]));
		}
		if (t.defences.some((d) => d.defenceSpecial !== undefined)) {
			row.defenceCalls++;
			t.defences.forEach((d, j) => {
				if (d.defenceSpecial === 'block') row.block += defence[j];
				if (d.defenceSpecial === 'dig') row.dig += defence[j];
			});
		}
		bySet.set(setMod, row);
		return ai.mixed.shot(game, team, rng);
	}
};
const seeds = Math.min(games, 100);
for (let seed = 1; seed <= seeds; seed++) {
	const g = playGame(newGame(seed), recorder);
	for (const e of g.log) {
		if (e.tag === 'pips') {
			meter.gained += Number(e.data!.gained);
			meter.wasted += Number(e.data!.wasted);
		}
		if (e.tag === 'calls') {
			if (e.data!.special) meter.attack++;
			if (e.data!.defenceSpecial === 'block') meter.block++;
			if (e.data!.defenceSpecial === 'dig') meter.dig++;
		}
	}
}
const perTeam = (n: number) => (n / seeds / 2).toFixed(1);
console.log('Charges in balanced play, per team per game (both players together)');
console.table({
	charges: {
		gained: perTeam(meter.gained),
		'wasted at the cap': perTeam(meter.wasted),
		'spent on hits': perTeam(meter.attack),
		'spent on blocks': perTeam(meter.block),
		'spent on digs': perTeam(meter.dig)
	}
});
console.log('How often balanced play spends a charge it has, by set quality');
console.table(
	Object.fromEntries(
		[...bySet]
			.sort(([a], [b]) => a - b)
			.map(([mod, r]) => [
				mod > 0 ? `+${mod}` : mod === 0 ? '±0' : String(mod),
				{
					'attack: spends': r.attackCalls ? pct(r.attack, r.attackCalls) : '–',
					'defence: on block': r.defenceCalls ? pct(r.block, r.defenceCalls) : '–',
					'defence: on dig': r.defenceCalls ? pct(r.dig, r.defenceCalls) : '–'
				}
			])
	)
);
