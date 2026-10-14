import { byTeam } from '../src/lib/engine/choosers';
import { lookahead } from '../src/lib/engine/lookahead';
import { playGame } from '../src/lib/engine/rally';
import { ABILITIES, matchGame, newRun, OPPONENTS, useRunRules } from '../src/lib/engine/run';
import type { AbilityId, Slot } from '../src/lib/engine/types';

/**
 * What is each run ability worth? Plays one match of a run with each ability given to Hinata, then to
 * Nishinoya, against the same games with no abilities, and reports the change in matches and points
 * won. Both sides play the lookahead's balanced mix. Points move less with luck, so read those first:
 * the aim is roughly +2 to +4 for each ability on the player it suits, and nothing far above.
 *
 *   npm run sim:abilities -- [games] [match 1-5] [rollouts per cell] [only,these,abilities]
 */
const games = Number(process.argv[2] ?? 200);
const match = Number(process.argv[3] ?? 3) - 1;
const rollouts = Number(process.argv[4] ?? 20);
const only = process.argv[5]?.split(',') as AbilityId[] | undefined;

useRunRules();
const ai = lookahead(rollouts);
const choosers = byTeam({ A: ai.mixed, B: ai.mixed });

function measure(abilities: Record<Slot, AbilityId[]>) {
	let wins = 0;
	let points = 0;
	let total = 0;
	for (let seed = 1; seed <= games; seed++) {
		const g = playGame(matchGame({ ...newRun(seed), match, abilities }), choosers);
		if (g.winner === 'A') wins++;
		points += g.score.A;
		total += g.score.A + g.score.B;
	}
	return { win: (100 * wins) / games, points: (100 * points) / total };
}

const base = measure({ blocker: [], defender: [] });
const change = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(1)}`;
const rows: Record<string, Record<string, string>> = {};
for (const id of only ?? (Object.keys(ABILITIES) as AbilityId[])) {
	for (const slot of ['blocker', 'defender'] as Slot[]) {
		const r = measure({ blocker: slot === 'blocker' ? [id] : [], defender: slot === 'defender' ? [id] : [] });
		rows[`${ABILITIES[id].name} · ${slot === 'blocker' ? 'Hinata' : 'Nishinoya'}`] = {
			matches: change(r.win - base.win),
			points: change(r.points - base.points)
		};
	}
	console.log(`${ABILITIES[id].name} done`);
}

console.log(
	`\nMatch ${match + 1} (${OPPONENTS[match].team}) · ${games} games each · no abilities: ${base.win.toFixed(0)}% of matches, ${base.points.toFixed(1)}% of points\n`
);
console.table(rows);
