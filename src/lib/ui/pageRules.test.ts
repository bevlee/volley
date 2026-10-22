import { describe, expect, it } from 'vitest';
import { config } from '../engine/config';
import { playRulesOf } from './pageRules';

describe('the rules each page plays', () => {
	it('plays advanced mode on /advanced only, and opening any other page puts the normal rules back', () => {
		playRulesOf('/advanced');
		expect(config.advanced).toBe(true);
		for (const id of ['/computer', '/run', '/online', '/admin', '/history', '/replay/[id]', '/', null]) {
			playRulesOf('/advanced');
			playRulesOf(id);
			expect(config.advanced, String(id)).toBe(false);
		}
	});
});
