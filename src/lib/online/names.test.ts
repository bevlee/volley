import { describe, expect, it } from 'vitest';
import { cleanName, NAME_MAX } from './names';

describe('cleanName', () => {
	it.each([
		['  Bev  ', 'Bev'],
		['Sam   Lee', 'Sam Lee'],
		['tab\there', 'tab here'],
		['bell\u0007', 'bell'],
		['zero\u200bwidth', 'zerowidth'],
		['   ', ''],
		[42, ''],
		['Émilie 🏐', 'Émilie 🏐']
	])('%j → %j', (raw, clean) => {
		expect(cleanName(raw)).toBe(clean);
	});

	it(`keeps at most ${NAME_MAX} characters, counting an emoji as one`, () => {
		expect(cleanName('a'.repeat(30))).toHaveLength(NAME_MAX);
		expect([...cleanName('🏐'.repeat(30))]).toHaveLength(NAME_MAX);
	});
});
