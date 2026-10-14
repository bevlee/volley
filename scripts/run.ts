import { byTeam } from '../src/lib/engine/choosers';
import { lookahead } from '../src/lib/engine/lookahead';
import { playGame } from '../src/lib/engine/rally';
import { mulberry32, pick } from '../src/lib/engine/rng';
import { canTake, choose, finishMatch, matchGame, newRun, OPPONENTS, useRunRules, type Run } from '../src/lib/engine/run';
import type { Slot } from '../src/lib/engine/types';
import { pct } from './matchups';

/**
 * How hard is each match of a run? Plays each one many times: a balanced player (the lookahead's
 * equilibrium mix) with the abilities a run would have by then, picked at random, against the
 * opponent playing its playbook the same way. Tune the opponents' stats until the curve looks right:
 * match 1 won most of the time, match 5 a bit over half.
 *
 *   npm run sim:run -- [games per match] [rollouts per cell]
 */
const games = Number(process.argv[2] ?? 100);
const rollouts = Number(process.argv[3] ?? 30);

useRunRules();
const ai = lookahead(rollouts);
const choosers = byTeam({ A: ai.mixed, B: ai.mixed });

/** A run that has reached `match` with random picks: each offered ability to a random player who can take it. */
function reach(match: number, seed: number): Run {
	const rng = mulberry32(seed);
	let run = newRun(seed);
	while (run.match < match) {
		run = finishMatch(run, true);
		const picks = run.offer.flatMap((ability) => {
			const slots = (['blocker', 'defender'] as Slot[]).filter((slot) => canTake(run, slot, ability));
			return slots.length ? [{ ability, slot: pick(rng, slots) }] : [];
		});
		run = choose(run, picks);
	}
	return run;
}

const rows: Record<string, Record<string, string>> = {};
for (let match = 0; match < OPPONENTS.length; match++) {
	let wins = 0;
	let points = 0;
	let total = 0;
	const started = performance.now();
	for (let seed = 1; seed <= games; seed++) {
		const g = playGame(matchGame(reach(match, seed)), choosers);
		if (g.winner === 'A') wins++;
		points += g.score.A;
		total += g.score.A + g.score.B;
	}
	const o = OPPONENTS[match];
	rows[`${match + 1}. ${o.team}`] = {
		attacks: o.playbook.map((p) => (p.shot === 'over' ? 'over' : `${p.tempo === 'fast' ? 'quick' : 'high'} ${p.shot}`)).join(', '),
		'you win': pct(wins, games),
		'your points': pct(points, total),
		seconds: ((performance.now() - started) / 1000).toFixed(0)
	};
	console.log(`match ${match + 1} done`);
}

console.log(`\n${games} games per match · ${rollouts} rollouts per cell · both sides balanced\n`);
console.table(rows);
