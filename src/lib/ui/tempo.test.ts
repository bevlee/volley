import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixedChoosers, randomChoosers } from '../engine/choosers';
import { config } from '../engine/config';
import { NUMBERED } from '../engine/lineup';
import { newGame, step } from '../engine/rally';
import { scriptedDice } from '../engine/rng';
import type { Calls, Game } from '../engine/types';
import { nextReveal, shotLine, tempoBanner, tempoCoverage, tempoReveal, type Reveal } from './tempo';

const advanced = config.advanced;
beforeEach(() => (config.advanced = true));
afterEach(() => (config.advanced = advanced));

/** All-4 players after B's serve, `n` steps on: pass and set first, then the call and the hit. */
function run(n: number, calls: Calls, dice: number[]): Game {
	const choosers = fixedChoosers({ blockMode: 'commit', ...calls });
	const rng = scriptedDice(dice);
	let g = step(newGame(1, NUMBERED));
	for (let i = 0; i < n; i++) g = step(g, choosers, rng);
	return g;
}

const tipLine: Calls = { shot: 'line', touch: 'tip', block: 'cross', stance: 'deep' };

describe('tempoCoverage', () => {
	it('shades a high-ball defence from the engine: the block takes the hard shot, the defender reads one corner and scrambles for two', () => {
		// Blocking cross, deep: the defender is in zone 1, the line corner the block leaves open.
		expect(tempoCoverage('high', { block: 'cross', stance: 'deep', blockMode: 'commit' })).toEqual([
			{ zone: 1, cover: 'read' },
			{ zone: 2, cover: 'close' },
			{ zone: 4, cover: 'open' },
			// A cross roll goes over the block to zone 5: a corner off from zone 1.
			{ zone: 5, cover: 'blocked', roll: 'close' }
		]);
		expect(tempoCoverage('high', { block: 'line', stance: 'short', blockMode: 'commit' })).toEqual([
			{ zone: 1, cover: 'blocked', roll: 'open' },
			{ zone: 2, cover: 'close' },
			{ zone: 4, cover: 'read' },
			{ zone: 5, cover: 'close' }
		]);
	});

	it('makes every zone a scramble when the blocker stays down', () => {
		const covers = tempoCoverage('high', { block: 'line', stance: 'deep', blockMode: 'none' });
		expect(covers.map((c) => c.cover)).toEqual(['close', 'close', 'close', 'close']);
	});

	it('leaves a quick ball only the block: one hard corner blocked, the other open', () => {
		expect(tempoCoverage('fast', { block: 'line', stance: 'deep', blockMode: 'commit' })).toEqual([
			{ zone: 1, cover: 'blocked' },
			{ zone: 5, cover: 'open' }
		]);
	});
});

describe('tempoBanner', () => {
	it('says how the set decides before there is one', () => {
		expect(tempoBanner(step(newGame(1, NUMBERED)), 'A')).toMatchObject({ tempo: null, label: 'Advanced' });
	});

	it('tells the attack a great set is a quick ball, with no time for their defender', () => {
		const g = run(2, tipLine, [6, 4]);
		expect(tempoBanner(g, 'A')).toEqual({ tempo: 'fast', label: 'Quick ball', lead: 'Perfect set +2.', text: 'Swing now. B2 has no time to move.' });
	});

	it('tells the defence whose set it was and to read the shot on a high ball', () => {
		// pass 4, set 2: a −2 set
		const g = run(2, tipLine, [4, 2]);
		expect(tempoBanner(g, 'B')).toEqual({ tempo: 'high', label: 'High ball', lead: 'Shaky set −2 from A2.', text: 'A1 has time to place it. Read the shot.' });
		expect(tempoBanner(g, 'A').text).toBe('Time to place it, and B1 and B2 have time to set up.');
	});
});

describe('shotLine', () => {
	it('says hard is weak off a bad set, whatever is picked', () => {
		expect(shotLine('cross', 'tip', -4)).toBe('Cross tip. Drops short over the block. Soft, so a good dig stops it. Hard is weak off a −4 set.');
		expect(shotLine('line', 'hard', -1)).toBe('Line hard. Weak off a −1 set: it takes the set twice over.');
		expect(shotLine('line', 'hard', 0)).toMatch(/^Line hard\. Full power/);
	});
});

describe('tempoReveal', () => {
	it('shows a close read: the tip went over the block, and the scramble dug it', () => {
		// tip 3, on target in zone 2; B2 deep in zone 1 scrambles 1 + 2 + 1 = 4
		const r = tempoReveal(run(4, tipLine, [4, 4, 3, 4, 2]))!;
		expect(r.headline).toBe('A1 tips it short down the line');
		expect(r.block).toEqual({ kicker: 'Block · cross', text: 'Tip goes over it', note: 'no effect', good: false });
		expect(r.dig).toEqual({ kicker: 'deep · one zone off', text: 'Right side, too deep', note: 'Scramble dig +1', good: true });
		expect(r.tally).toEqual({ attack: 'Tip 3', against: 'Scramble 4', verdict: 'Dug', defenceWins: true });
	});

	it('shows a stay-down: no block, and both dig', () => {
		const r = tempoReveal(run(4, { shot: 'cross', touch: 'roll', block: 'line', stance: 'deep', blockMode: 'none' }, [4, 4, 3, 4, 4]))!;
		expect(r.block).toMatchObject({ kicker: 'B1 stayed down', text: 'No block' });
		expect(r.dig).toMatchObject({ kicker: 'Both dig' });
	});

	it('shows a quick ball past the wrong block as a kill with nothing to meet it', () => {
		// pass 6, set 4: a quick ball; 4 + 4 + 2 × 2 = 12, plus (4 + 4) / 2
		const r = tempoReveal(run(4, { shot: 'cross', touch: 'hard', block: 'line', stance: 'deep' }, [6, 4, 4]))!;
		expect(r.block).toMatchObject({ text: 'The cross goes around it', note: 'kill' });
		expect(r.dig).toBeNull();
		expect(r.tally).toEqual({ attack: 'Hit 16', against: null, verdict: 'Kill', defenceWins: false });
	});

	it('is nothing in a normal game', () => {
		config.advanced = false;
		expect(tempoReveal(run(4, { shot: 'cross', block: 'line', stance: 'deep' }, [4, 4, 3, 4, 4]))).toBeNull();
	});
});

describe('nextReveal', () => {
	it('only ever shows the attack most recently called', () => {
		let shown = 0;
		for (let seed = 1; seed <= 40; seed++) {
			let g = newGame(seed);
			let reveal: Reveal | null = null;
			while (g.phase.kind !== 'gameOver') {
				g = step(g, randomChoosers);
				reveal = nextReveal(reveal, g);
				if (!reveal) continue;
				shown++;
				const called = g.log.findLast((e) => e.tag === 'calls')!.data!;
				expect(reveal.team, g.log.slice(g.logStart).map((e) => e.text).join(' / ')).toBe(called.team);
				expect(reveal.headline.startsWith(String(called.hitter))).toBe(true);
			}
		}
		expect(shown).toBeGreaterThan(1000);
	});
});
