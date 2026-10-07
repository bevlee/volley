import { describe, expect, it } from 'vitest';
import { d6, int, mulberry32, pick, scriptedDice } from './rng';

describe('mulberry32', () => {
	it('repeats the same sequence for the same seed', () => {
		const a = mulberry32(42);
		const b = mulberry32(42);
		const roll = (rng: typeof a) => Array.from({ length: 5 }, () => rng.next());
		expect(roll(a)).toEqual(roll(b));
	});

	it('resumes from a saved state', () => {
		const a = mulberry32(7);
		a.next();
		a.next();
		const resumed = mulberry32(a.state);
		expect(resumed.next()).toBe(a.next());
	});
});

describe('d6', () => {
	it('only rolls 1-6 and hits every face', () => {
		const rng = mulberry32(1);
		const seen = new Set(Array.from({ length: 600 }, () => d6(rng)));
		expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
	});
});

describe('scriptedDice', () => {
	it('returns the scripted dice in order', () => {
		const rng = scriptedDice([3, 6, 1]);
		expect([d6(rng), d6(rng), d6(rng)]).toEqual([3, 6, 1]);
	});

	it('throws when it runs out', () => {
		const rng = scriptedDice([2]);
		d6(rng);
		expect(() => d6(rng)).toThrow(/ran out/);
	});
});

describe('int and pick', () => {
	it('stay in range', () => {
		const rng = mulberry32(3);
		for (let i = 0; i < 200; i++) {
			const n = int(rng, 3, 6);
			expect(n).toBeGreaterThanOrEqual(3);
			expect(n).toBeLessThanOrEqual(6);
			expect(['x', 'y']).toContain(pick(rng, ['x', 'y']));
		}
	});
});
