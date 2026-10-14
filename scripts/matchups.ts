import { byTeam, randomChoosers, type Choosers } from '../src/lib/engine/choosers';
import { equilibrium, type lookahead } from '../src/lib/engine/lookahead';
import { newGame, playGame } from '../src/lib/engine/rally';
import { SHOTS } from '../src/lib/engine/rules';
import type { TeamId } from '../src/lib/engine/types';

export const pct = (n: number, of: number) => `${((100 * n) / of).toFixed(1)}%`;
/** 95% margin of error on a share out of `n`. */
const margin = (p: number, n: number) => `±${(196 * Math.sqrt((p * (1 - p)) / n)).toFixed(1)}`;

/** Plays `first` against `second` from both sides of the net, since the lineups differ, and sums up how `first` did. */
export function matchup(first: Choosers, second: Choosers, games: number) {
	let wins = 0;
	let points = 0;
	let total = 0;
	const started = performance.now();
	for (const team of ['A', 'B'] as TeamId[]) {
		const rival: TeamId = team === 'A' ? 'B' : 'A';
		const choosers = byTeam({ [team]: first, [rival]: second } as Record<TeamId, Choosers>);
		for (let seed = 1; seed <= games; seed++) {
			const g = playGame(newGame(seed), choosers);
			if (g.winner === team) wins++;
			points += g.score[team];
			total += g.score.A + g.score.B;
		}
	}
	const played = 2 * games;
	return {
		'games won by first': `${pct(wins, played)} ${margin(wins / played, played)}`,
		'points won': `${pct(points, total)} ${margin(points / total, total)}`,
		seconds: ((performance.now() - started) / 1000).toFixed(0)
	};
}

/** How a balanced attacker mixes its shots, by how good the set was, over the sets of `games` random games. */
export function shotMix(ai: ReturnType<typeof lookahead>, games: number) {
	const bySet = new Map<number, { calls: number; mix: Record<string, number> }>();
	const recorder: Choosers = {
		...randomChoosers,
		shot: (game, team, rng) => {
			const t = ai.table(game);
			const { attack } = equilibrium(t.payoffs);
			const setMod = game.attack!.setMod!;
			const row = bySet.get(setMod) ?? { calls: 0, mix: { line: 0, cross: 0, tip: 0 } };
			row.calls++;
			t.attacks.forEach(({ shot }, i) => (row.mix[shot] += attack[i]));
			bySet.set(setMod, row);
			return randomChoosers.shot(game, team, rng);
		}
	};
	for (let seed = 1; seed <= games; seed++) playGame(newGame(seed), recorder);
	return Object.fromEntries(
		[...bySet]
			.sort(([a], [b]) => a - b)
			.map(([mod, { calls, mix }]) => [
				mod > 0 ? `+${mod}` : mod === 0 ? '±0' : String(mod),
				{ calls, ...Object.fromEntries(SHOTS.map((shot) => [shot, pct(mix[shot], calls)])) }
			])
	);
}
