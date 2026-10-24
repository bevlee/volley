import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { config } from './config';
import { NUMBERED } from './lineup';
import { lookahead } from './lookahead';
import { newGame, step } from './rally';
import { scriptedDice } from './rng';
import type { Game } from './types';

const saved = structuredClone(config);
beforeEach(() => (config.advanced = true));
afterEach(() => Object.assign(config, structuredClone(saved)));

/** A's call, after its pass and set. */
function atCalls(pass: number, set: number): Game {
	const dice = scriptedDice([pass, set]);
	let g = step(newGame(1, NUMBERED));
	g = step(g, undefined, dice);
	return step(g, undefined, dice);
}

describe('lookahead in advanced mode', () => {
	const { table } = lookahead(4);

	it('weighs a quick ball as hard line or cross against a block call alone', () => {
		// Pass 6 (+2), set 4: a +2 set.
		const t = table(atCalls(6, 4));
		expect(t.attacks.map((a) => `${a.shot} ${a.touch}`)).toEqual(['line hard', 'cross hard']);
		expect(t.defences.map((d) => [d.block, d.stance])).toEqual([
			['line', undefined],
			['cross', undefined]
		]);
	});

	it('weighs every high-ball shot against every block and stance, blocking or pulling off', () => {
		// Pass 4 (±0), set 4: a ±0 set.
		const t = table(atCalls(4, 4));
		expect(t.attacks).toHaveLength(6);
		expect(t.defences.map((d) => d.blockMode)).toEqual(['commit', 'none', 'commit', 'none', 'commit', 'none', 'commit', 'none']);
		expect(t.payoffs.flat().every((p) => p >= 0 && p <= 1)).toBe(true);
	});
});
