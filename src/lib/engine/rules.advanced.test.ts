import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { config } from './config';
import { NUMBERED } from './lineup';
import { newGame } from './rally';
import { advancedLanding, attackOptions, defenderAt, firstTouch, ladder, readOutcome, targetOf } from './rules';
import type { Calls, Channel, ReadOutcome, Stance, Touch, Zone } from './types';

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

const team = () => newGame(1, NUMBERED).teams.A;

describe('advanced mode rules', () => {
	describe('attack options', () => {
		const shots = (setMod: number) => attackOptions(team(), team().blocker, setMod).map((o) => `${o.tempo} ${o.shot} ${o.touch}`);

		it('a great set is a quick ball: hard line or hard cross', () =>
			expect(shots(2)).toEqual(['fast line hard', 'fast cross hard']));

		it.each([
			[0, ['high line hard', 'high line tip', 'high line roll', 'high cross hard', 'high cross tip', 'high cross roll']],
			[-2, ['high line tip', 'high line roll', 'high cross tip', 'high cross roll']],
			[-3, ['high line tip', 'high cross tip', 'high cross roll']]
		])('a %i set leaves the high-ball shots its table allows', (setMod, expected) => expect(shots(setMod)).toEqual(expected));

		it('leaves run mode its own attacks', () => {
			const kit = { ...team(), runKit: true };
			expect(attackOptions(kit, kit.blocker, 2).map((o) => o.shot)).toContain('over');
		});

		it("can't be played with block modes", () => {
			config.blockModes = true;
			expect(() => attackOptions(team(), team().blocker, 0)).toThrow();
		});
	});

	describe('the default high-ball table', () => {
		beforeEach(() => Object.assign(config, structuredClone(saved), { advanced: true }));
		const worstSet = ladder(1 + Math.min(firstTouch(1), config.touchFirstMod));

		it.each([worstSet, -1, 0, 1])('leaves all six high-ball shots on off a %i set', (setMod) =>
			expect(attackOptions(team(), team().blocker, setMod)).toHaveLength(6));
	});

	describe('reads', () => {
		const defences: [Channel, Stance][] = [
			['line', 'deep'],
			['line', 'short'],
			['cross', 'deep'],
			['cross', 'short']
		];
		/** Each shot against the four defence calls above, in order. */
		const expected: [Channel, Touch, ReadOutcome[]][] = [
			['line', 'hard', ['close', 'wrong', 'read', 'close']],
			['line', 'roll', ['close', 'wrong', 'read', 'close']],
			['line', 'tip', ['wrong', 'close', 'close', 'read']],
			['cross', 'hard', ['read', 'close', 'close', 'wrong']],
			['cross', 'roll', ['read', 'close', 'close', 'wrong']],
			['cross', 'tip', ['close', 'read', 'wrong', 'close']]
		];
		const cases = expected.flatMap(([shot, touch, outcomes]) =>
			defences.map(([block, stance], i) => [shot, touch, block, stance, outcomes[i]] as const)
		);

		it.each(cases)('%s %s against block %s, defender %s: %s', (shot, touch, block, stance, outcome) => {
			const calls: Calls = { shot, touch, block, stance };
			expect(readOutcome(defenderAt(calls), targetOf(calls))).toBe(outcome);
		});

		it('gives every shot one read, two closes and one wrong', () => {
			for (const [, , outcomes] of expected) expect([...outcomes].sort()).toEqual(['close', 'close', 'read', 'wrong']);
		});

		it('puts the defender on each corner once', () =>
			expect(defences.map(([block, stance]) => defenderAt({ shot: 'line', touch: 'tip', block, stance })).sort()).toEqual([
				1, 2, 4, 5
			]));
	});

	describe('a drifting high ball', () => {
		const noTie = (): Zone => {
			throw new Error('unexpected tie');
		};

		it('from a close read, drifts onto the defender', () =>
			// Line tip lands in 2; blocking cross and deep puts the defender in 1.
			expect(advancedLanding({ shot: 'line', touch: 'tip', block: 'cross', stance: 'deep' }, 5, noTie)).toBe(1));

		it('from a wrong read, drifts to either corner a close read away', () => {
			let offered: Zone[] = [];
			const tie = (zones: Zone[]) => ((offered = zones), zones[0]);
			// Line tip lands in 2; blocking line and deep puts the defender in 5.
			advancedLanding({ shot: 'line', touch: 'tip', block: 'line', stance: 'deep' }, 5, tie);
			expect(offered.sort()).toEqual([1, 4]);
		});

		it('on target, or into the block, lands where it was aimed', () => {
			expect(advancedLanding({ shot: 'cross', touch: 'roll', block: 'line', stance: 'short' }, config.accuracyExact, noTie)).toBe(5);
			expect(advancedLanding({ shot: 'cross', touch: 'hard', block: 'line', stance: 'short' }, config.accuracyIntoBlock, noTie)).toBe(5);
		});
	});
});
