import { describe, expect, it } from 'vitest';
import { LINEUP } from './lineup';
import { newGame, playGame } from './rally';

describe('lineup', () => {
	it('puts the Haikyu!! players on court, with Kageyama serving first', () => {
		const g = newGame(1);
		expect([g.teams.A.blocker.name, g.teams.A.defender.name, g.teams.B.blocker.name, g.teams.B.defender.name]).toEqual([
			'Hinata',
			'Nishinoya',
			'Tsukishima',
			'Kageyama'
		]);
		expect(g.teams.A.blocker).toMatchObject({ attack: 6, defense: 2, slot: 'blocker' });
		expect(g.log[0].text).toBe('Kageyama to serve');
	});

	it('keeps the two sides close to even over many games, from either side of the net', () => {
		const N = 600;
		let hinataSide = 0;
		for (let s = 1; s <= N; s++) if (playGame(newGame(s)).winner === 'A') hinataSide++;
		for (let s = 1; s <= N; s++) if (playGame(newGame(s + N, { A: LINEUP.B, B: LINEUP.A })).winner === 'B') hinataSide++;
		// 8,000 games put it at 48%; 1,200 here allows about ±3 for chance, plus a little.
		expect(hinataSide / (2 * N)).toBeGreaterThan(0.42);
		expect(hinataSide / (2 * N)).toBeLessThan(0.58);
	});
});
