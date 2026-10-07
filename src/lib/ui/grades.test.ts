import { describe, expect, it } from 'vitest';
import { hitGrade, setGrade, touchGrade } from './grades';

describe('grades', () => {
	it('grades a pass or dig by its first-touch bonus', () => {
		expect([2, 1, 0, -1, -2].map(touchGrade)).toEqual(['Perfect', 'Good', 'Good', 'Shaky', 'Poor']);
	});

	it('grades a set by its quality', () => {
		expect([2, 0, -1, -2, -3, -5].map(setGrade)).toEqual(['Perfect', 'Good', 'Shaky', 'Shaky', 'Poor', 'Poor']);
	});

	it('grades a hard hit against what a covering defender usually digs (about 10)', () => {
		expect([16, 14, 13, 11, 10, 8, 7, 3].map((n) => hitGrade(n, 'line'))).toEqual([
			'Perfect',
			'Perfect',
			'Good',
			'Good',
			'Shaky',
			'Shaky',
			'Poor',
			'Poor'
		]);
	});

	it('grades a tip on a lower scale, since it never gets the setter’s share', () => {
		expect([11, 8, 7, 5, 4].map((n) => hitGrade(n, 'tip'))).toEqual(['Perfect', 'Good', 'Shaky', 'Shaky', 'Poor']);
	});

	it('calls a mis-hit poor however hard it was', () => {
		expect(hitGrade(15, 'cross', true)).toBe('Poor');
	});
});
