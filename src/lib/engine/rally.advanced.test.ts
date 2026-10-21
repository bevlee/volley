import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixedChoosers } from './choosers';
import { config } from './config';
import { NUMBERED } from './lineup';
import { newGame, step } from './rally';
import { scriptedDice } from './rng';
import type { Calls, Game } from './types';

const saved = structuredClone(config);
beforeEach(() => {
	config.advanced = true;
	config.highBallMinSet = {
		line: { hard: -1, tip: null, roll: -2 },
		cross: { hard: -1, tip: null, roll: null }
	};
	config.quickBlockBonus = 3;
});
afterEach(() => Object.assign(config, structuredClone(saved)));

/** A game of all-4 players where B has served, so the next step is A1's pass and A1 hits. */
const served = () => step(newGame(1, NUMBERED));

function run(n: number, calls: Calls, dice: number[], start: Game = served()): Game {
	const choosers = fixedChoosers(calls);
	const rng = scriptedDice(dice);
	let g = start;
	for (let i = 0; i < n; i++) g = step(g, choosers, rng);
	return g;
}

const entries = (g: Game, tag: string) => g.log.filter((e) => e.tag === tag);
const lastPoint = (g: Game) => entries(g, 'point').at(-1)?.data;

describe('advanced mode rallies', () => {
	describe('tempo', () => {
		it.each([
			// Pass 6 (+2) and set 4: a +2 set.
			[[6, 4], 'fast'],
			// Pass 4 (±0) and set 4: a ±0 set.
			[[4, 4], 'high']
		] as const)('comes from the set, logged before the calls: %j is %s', (dice, tempo) => {
			const calls: Calls = { shot: 'line', touch: 'hard', block: 'line', stance: 'deep' };
			const g = run(3, calls, [...dice]);
			const tags = g.log.map((e) => e.tag);
			expect(tags.indexOf('tempo')).toBeLessThan(tags.indexOf('calls'));
			expect(entries(g, 'tempo')[0].data).toMatchObject({ team: 'A', tempo });
			expect(entries(g, 'calls')[0].data).toMatchObject({ tempo, shot: 'line', touch: 'hard' });
		});
	});

	describe('a quick ball', () => {
		// Pass 6 (+2), set 4 (+2), power 3: 4 + 3 + 2 = 9, plus the setter's (4 + 4) / 2 = 13.
		const quick = [6, 4, 3];

		it('is a kill when the block goes the other way, with no aim roll', () => {
			const g = run(4, { shot: 'line', touch: 'hard', block: 'cross', stance: 'deep' }, quick);
			expect(lastPoint(g)).toMatchObject({ winner: 'A', kind: 'kill' });
			expect(g.rolls.map((r) => r.label)).toEqual(['power']);
		});

		it('meets the block down its channel with the quick-ball bonus: clean is a kill', () => {
			// Block 4 + 2 + 3 = 9 vs 13: clean.
			const g = run(4, { shot: 'cross', touch: 'hard', block: 'cross', stance: 'short' }, [...quick, 2]);
			expect(entries(g, 'block')[0].data).toMatchObject({ result: 'clean', total: 9 });
			expect(lastPoint(g)).toMatchObject({ winner: 'A', kind: 'kill' });
		});

		it('a block touch is the blocking side\'s first contact', () => {
			// Block 4 + 6 + 3 = 13 vs 13: a touch.
			const g = run(4, { shot: 'cross', touch: 'hard', block: 'cross', stance: 'short' }, [...quick, 6]);
			expect(g.phase.kind).toBe('touched');
		});

		it('a stuff scores for the block', () => {
			config.quickBlockBonus = 6;
			// Block 4 + 6 + 6 = 16 vs 13: stuffed.
			const g = run(4, { shot: 'line', touch: 'hard', block: 'line', stance: 'deep' }, [...quick, 6]);
			expect(lastPoint(g)).toMatchObject({ winner: 'B', kind: 'stuff' });
		});
	});

	describe('a high ball', () => {
		// Pass 4 (±0), set 4 (±0), power 3, aim 4: 4 + 0 + 0 + 4 = 8, on target.
		const high = [4, 4, 3, 4];

		it('a close read is a scramble at half reach and a smaller bonus', () => {
			// Line tip (4 + 3 = 7, no setter share) lands in 2; the defender plays 1. Dig 4 × 0.5 + 5 + 1 = 8: up.
			const g = run(4, { shot: 'line', touch: 'tip', block: 'cross', stance: 'deep' }, [...high, 5]);
			const dig = entries(g, 'dig')[0];
			expect(dig.data).toMatchObject({ outcome: 'close', total: 8, attack: 7, up: true });
			expect(dig.text).toContain('scrambles');
		});

		it('a soft shot goes over the block', () => {
			// Line roll lands in 1 past a line block; the defender plays 5 (close). Dig 2 + 1 + 1 = 4 vs 7: a kill.
			const g = run(4, { shot: 'line', touch: 'roll', block: 'line', stance: 'deep' }, [...high, 1]);
			expect(entries(g, 'block')).toHaveLength(0);
			expect(lastPoint(g)).toMatchObject({ winner: 'A', kind: 'kill' });
		});

		it("a hard shot down the block's channel meets the block", () => {
			const g = run(4, { shot: 'line', touch: 'hard', block: 'line', stance: 'deep' }, [...high, 3, 3]);
			expect(entries(g, 'block')).toHaveLength(1);
		});

		it("won't take a shot the set doesn't leave on", () => {
			// Pass 1 (−2), set 3: a −3 set, too poor for line roll.
			expect(() => run(3, { shot: 'line', touch: 'roll', block: 'line', stance: 'deep' }, [1, 3])).toThrow(/isn't on/);
		});
	});
});
