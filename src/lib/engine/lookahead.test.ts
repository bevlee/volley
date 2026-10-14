import { describe, expect, it } from 'vitest';
import { equilibrium } from './lookahead';

describe('equilibrium', () => {
	it('mixes evenly when each guess beats the other half the time', () => {
		// Matching pennies: the attacker wins when the defence guesses wrong.
		const { attack, defence } = equilibrium([
			[0, 1],
			[1, 0]
		]);
		for (const p of [...attack, ...defence]) expect(p).toBeCloseTo(0.5, 1);
	});

	it('always plays a shot that is best whatever the defence does', () => {
		const { attack } = equilibrium([
			[0.6, 0.7],
			[0.4, 0.5],
			[0.3, 0.2]
		]);
		expect(attack[0]).toBeGreaterThan(0.99);
	});

	it('leaves the defence no better answer than its mix', () => {
		const m = [
			[0.3, 0.8, 0.6],
			[0.7, 0.4, 0.5]
		];
		const { attack, defence } = equilibrium(m);
		const value = m.reduce((v, row, i) => v + row.reduce((s, x, j) => s + x * attack[i] * defence[j], 0), 0);
		for (let j = 0; j < 3; j++) {
			const vsColumn = m.reduce((s, row, i) => s + row[j] * attack[i], 0);
			expect(vsColumn).toBeGreaterThanOrEqual(value - 0.01);
		}
	});
});
