import { describe, expect, it } from 'vitest';
import { fixedChoosers } from '../engine/choosers';
import { newGame, step } from '../engine/rally';
import { scriptedDice } from '../engine/rng';
import type { Calls, Game } from '../engine/types';
import { buildUp, type Touch } from './buildUp';

function evenGame(): Game {
	const g = newGame(1);
	for (const team of [g.teams.A, g.teams.B]) {
		for (const p of [team.blocker, team.defender]) {
			p.attack = 4;
			p.defense = 4;
		}
	}
	return step(g); // B serves; the next step is A's pass
}

/** Play `n` steps with fixed calls and scripted dice. Every stat is 4. */
function run(n: number, calls: Calls, dice: number[]): Game {
	const choosers = fixedChoosers(calls);
	const rng = scriptedDice(dice);
	let g = evenGame();
	for (let i = 0; i < n; i++) g = step(g, choosers, rng);
	return g;
}

const crossPastBlock: Calls = { shot: 'cross', block: 'line', stance: 'deep' };
const line: Calls = { shot: 'line', block: 'line', stance: 'deep' };
const short = (touches: Touch[]) => touches.map((t) => `${t.label} ${t.who}: ${t.result}`);

describe('buildUp', () => {
	it('is empty before the first touch', () => {
		expect(buildUp(evenGame())).toEqual([]);
	});

	it('shows the pass, then the pass and the set', () => {
		// pass 1 → −2; set 2 − 2 = 0 → −4
		expect(short(buildUp(run(1, line, [1])))).toEqual(['Pass A1: Poor −2']);
		expect(short(buildUp(run(2, line, [1, 2])))).toEqual(['Pass A1: Poor −2', 'Set A2: Poor −4']);
	});

	it('keeps the attack in the scoreline until the dig is set, then shows the dig and its set', () => {
		// cross past a line block, dug up by the covering defender with a 5 → +1, shown as just Good
		const dug = run(4, crossPastBlock, [4, 4, 2, 6, 5]);
		expect(short(buildUp(dug))).toEqual(['Pass A1: Good', 'Set A2: Good']);
		// B1 sets the dig: 4 + 1 = 5 → +0
		expect(short(buildUp(run(5, crossPastBlock, [4, 4, 2, 6, 5, 4])))).toEqual(['Dig B2: Good', 'Set B1: Good']);
	});

	it('counts a block touch as the first touch', () => {
		// set 3 → −1; attack 4 + 4 − 1 + (4 + 3) / 2 = 10; aim 1 + 0 − 1 + 4 = 4 → into the block;
		// block 4 + 2 + 3 = 9 vs 10 → touch; B2 sets 4 − 1 = 3 → −1
		expect(short(buildUp(run(5, crossPastBlock, [4, 3, 4, 1, 2, 4])))).toEqual(['Block B1: Touch 9', 'Set B2: Shaky −1']);
	});
});
