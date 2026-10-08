import { describe, expect, it } from 'vitest';
import { fixedChoosers } from '../engine/choosers';
import { newGame, step } from '../engine/rally';
import { scriptedDice } from '../engine/rng';
import type { Calls, Game } from '../engine/types';
import { rallyHistory } from './history';

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
const short = (h: ReturnType<typeof rallyHistory>) => h.map((t) => `${t.label} ${t.who}: ${t.result}${t.current ? ' *' : ''}`);

describe('rallyHistory', () => {
	it('is empty before the first touch', () => {
		expect(rallyHistory(evenGame())).toEqual([]);
	});

	it('shows the pass, then the set, as the attack being built', () => {
		// pass 1 → −2; set 2 − 2 = 0 → −4
		expect(short(rallyHistory(run(1, line, [1])))).toEqual(['Pass A1: Poor −2 *']);
		expect(short(rallyHistory(run(2, line, [1, 2])))).toEqual(['Pass A1: Poor −2 *', 'Set A2: Poor −4 *']);
	});

	it('leaves the attack, block and dig to the scoreline until the next set', () => {
		// cross past a line block, dug up by the covering defender with a 5 → +1
		const dug = run(4, crossPastBlock, [4, 4, 2, 6, 5]);
		expect(short(rallyHistory(dug))).toEqual(['Pass A1: Good +0 *', 'Set A2: Good +0 *']);
		// B1 sets the dig: 4 + 1 = 5 → +0
		expect(short(rallyHistory(run(5, crossPastBlock, [4, 4, 2, 6, 5, 4])))).toEqual([
			'Pass A1: Good +0',
			'Set A2: Good +0',
			'Cross A1: 10',
			'Dig B2: Good +1 *',
			'Set B1: Good +0 *'
		]);
	});

	it('counts a block touch as the first touch, and notes a shot aimed into the block', () => {
		// set 3 → −1; attack 4 + 4 − 1 + (4 + 3) / 2 = 10; aim 1 + 0 − 1 + 4 = 4 → into the block;
		// block 4 + 2 + 3 = 9 vs 10 → touch; B2 sets 4 − 1 = 3 → −1
		expect(short(rallyHistory(run(5, crossPastBlock, [4, 3, 4, 1, 2, 4])))).toEqual([
			'Pass A1: Good +0',
			'Set A2: Shaky −1',
			'Cross A1: 10 · into block',
			'Block B1: Touch 9 *',
			'Set B2: Shaky −1 *'
		]);
	});
});
