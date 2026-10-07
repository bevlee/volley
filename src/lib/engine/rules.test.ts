import { describe, expect, it } from 'vitest';
import { config } from './config';
import {
	accuracy,
	adjacent,
	blockResult,
	defenderZone,
	digTotal,
	distance,
	gameWinner,
	isGuaranteedKill,
	isRead,
	isShank,
	ladder,
	landing,
	power,
	reach,
	teamAttack
} from './rules';
import type { Zone } from './types';

const noTie = (): Zone => {
	throw new Error('unexpected tie');
};

describe('ladder', () => {
	it.each([
		[8, 2],
		[6, 2],
		[5, 0],
		[4, 0],
		[3, -1],
		[2, -2],
		[1, -3],
		[0, -4],
		[-3, -7]
	])('total %i gives %i', (total, mod) => expect(ladder(total)).toBe(mod));
});

describe('power', () => {
	it('adds attack, die and set modifier', () => expect(power(5, 4, -2)).toBe(7));
	it('team attack adds half the partner (attack + die), rounded down', () =>
		expect(teamAttack(7, 4, 3)).toBe(10));
});

describe('accuracy', () => {
	it('adds the die, both touch modifiers and the setter attack', () =>
		expect(accuracy(3, -1, 2, 5)).toBe(9));
});

describe('court geometry', () => {
	it('measures zone distance in grid steps', () => {
		expect(distance(1, 1)).toBe(0);
		expect(distance(1, 6)).toBe(1);
		expect(distance(1, 2)).toBe(1);
		expect(distance(5, 1)).toBe(2);
		expect(distance(3, 5)).toBe(2);
		expect(distance(4, 1)).toBe(3);
	});

	it('lists adjacent zones', () => {
		expect(adjacent(1)).toEqual([2, 6]);
		expect(adjacent(3)).toEqual([2, 4, 6]);
	});

	it('puts a deep defender in the channel the blocker leaves open', () => {
		expect(defenderZone('deep', 'line')).toBe(5);
		expect(defenderZone('deep', 'cross')).toBe(1);
		expect(defenderZone('short', 'line')).toBe(3);
	});
});

describe('landing', () => {
	it('hits the target at the exact threshold', () =>
		expect(landing('line', config.accuracyExact, 5, noTie)).toBe(1));

	it('is an easy ball at the easy threshold', () =>
		expect(landing('cross', config.accuracyEasy, 1, noTie)).toBe('easy'));

	it('drifts to the neighbour closest to the defender', () =>
		// line target 1 has neighbours 2 and 6; a deep-cross defender in 5 is closer to 6
		expect(landing('line', 5, 5, noTie)).toBe(6));

	it('breaks ties with the tie picker', () =>
		// tip target 3 has neighbours 2, 4, 6, all one step from a short defender in 3
		expect(landing('tip', 5, 3, (zones) => Math.max(...zones) as Zone)).toBe(6));
});

describe('reads', () => {
	it('deep reads a hard shot into the open channel', () => {
		expect(isRead('cross', 'line', 'deep')).toBe(true);
		expect(isRead('line', 'line', 'deep')).toBe(false);
	});

	it('short reads a tip only', () => {
		expect(isRead('tip', 'line', 'short')).toBe(true);
		expect(isRead('tip', 'cross', 'deep')).toBe(false);
		expect(isRead('cross', 'line', 'short')).toBe(false);
	});
});

describe('block', () => {
	it('stuffs when the block wins by the margin', () => expect(blockResult(12, 9)).toBe('stuff'));
	it('is clean when the attack wins by the margin', () => expect(blockResult(9, 12)).toBe('clean'));
	it('touches inside the margin', () => {
		expect(blockResult(11, 9)).toBe('touch');
		expect(blockResult(10, 12)).toBe('touch');
	});
});

describe('dig', () => {
	it('scales reach by distance', () => {
		expect(reach(0)).toBe(1);
		expect(reach(1)).toBe(0.5);
		expect(reach(2)).toBe(0.25);
		expect(reach(3)).toBe(0.25);
	});

	it('rounds Defense x reach down, then adds the die and read bonus', () => {
		expect(digTotal(5, 0.5, 3, false)).toBe(5);
		expect(digTotal(5, 1, 3, true)).toBe(8 + config.readBonus);
	});
});

describe('special dice', () => {
	it('shank needs two natural 1s', () => {
		expect(isShank(1, 1)).toBe(true);
		expect(isShank(1, 2)).toBe(false);
	});

	it('guaranteed kill needs 6 then 6', () => {
		expect(isGuaranteedKill(6, 6)).toBe(true);
		expect(isGuaranteedKill(6, 5)).toBe(false);
	});
});

describe('gameWinner', () => {
	it('needs the target score and a 2-point lead', () => {
		expect(gameWinner({ A: 21, B: 19 })).toBe('A');
		expect(gameWinner({ A: 21, B: 20 })).toBeNull();
		expect(gameWinner({ A: 24, B: 26 })).toBe('B');
		expect(gameWinner({ A: 20, B: 5 })).toBeNull();
	});
});
