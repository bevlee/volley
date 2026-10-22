import { describe, expect, it } from 'vitest';
import { config } from '../engine/config';
import { newGame, playGame } from '../engine/rally';
import { useRunRules } from '../engine/run';
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

	it("puts back the rules a run turned on, so a game after a run plays by the page's own rules", () => {
		const normal = structuredClone({ blockModes: config.blockModes, minSet: config.minSet });
		useRunRules();
		playRulesOf('/computer');
		expect({ blockModes: config.blockModes, minSet: config.minSet }).toEqual(normal);
		useRunRules();
		playRulesOf('/advanced');
		expect(playGame(newGame(3)).winner).not.toBeNull();
		playRulesOf('/');
	});
});
