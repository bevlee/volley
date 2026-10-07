import { describe, expect, it } from 'vitest';
import { fixedChoosers } from '../engine/choosers';
import { newGame, step } from '../engine/rally';
import { scriptedDice } from '../engine/rng';
import type { Calls, Game } from '../engine/types';
import { scoreSheet } from './scores';

function evenGame(): Game {
	const g = newGame(1);
	for (const team of [g.teams.A, g.teams.B]) {
		for (const p of [team.blocker, team.defender]) {
			p.attack = 4;
			p.defense = 4;
		}
	}
	return step(g); // B serves; the next step is A's pass
}

function run(n: number, calls: Calls, dice: number[]): Game {
	const choosers = fixedChoosers(calls);
	const rng = scriptedDice(dice);
	let g = evenGame();
	for (let i = 0; i < n; i++) g = step(g, choosers, rng);
	return g;
}

const values = (terms: { value: string }[]) => terms.map((t) => t.value);

describe('scoreSheet', () => {
	it('is empty before anyone has set up an attack', () => {
		expect(scoreSheet(newGame(1))).toBeNull();
		expect(scoreSheet(run(1, { shot: 'line', block: 'line', stance: 'deep' }, [4]))).toBeNull();
	});

	it('shows the set’s bonus to the hit, with the power die still to roll, while the play is called', () => {
		// pass 4, set 4 → +0; the setter's share is (4 + set die 4) / 2 = 4, so the set is worth +4
		const s = scoreSheet(run(2, { shot: 'line', block: 'line', stance: 'deep' }, [4, 4]))!;
		expect(s.attack.total).toBeNull();
		expect(s.attack.verdict).toBeUndefined();
		expect(s.setup).toEqual(['Good pass', 'Good set']);
		expect(s.setBonus).toBe(4);
		expect(values(s.attack.terms)).toEqual(['4', '?', '+4']);
		expect(s.attack.terms.map((t) => t.label)).toEqual(["A1's base attack", 'Roll', 'Good set']);
		expect(values(s.attack.terms[2].parts!)).toEqual(['+0', '+4']);
		expect(s.attack.terms[2].parts![1].label).toBe("Setter: ½ (A2's base attack 4 + set roll 4)");
		expect(s.block).toBeNull();
		expect(s.dig).toBeNull();
	});

	it('adds up a hard attack with the setter’s share, against the block', () => {
		// pass 4, set 4 → +0; power 2 → 6, setter (4 + 4) / 2 = 4 → 10; aim 4 → on target; block 4 + 6 + 3 = 13 → stuff
		const s = scoreSheet(run(4, { shot: 'line', block: 'line', stance: 'deep' }, [4, 4, 2, 4, 6]))!;
		expect(values(s.attack.terms)).toEqual(['4', '2', '+4']);
		expect(s.attack.total).toBe(10);
		expect(s.attack.verdict).toBe('Shaky hit');
		expect(s.aim?.result).toBe('exact');
		// aim 4 + pass 0 + set 0 + A2's base attack 4 = 8
		expect(s.aim?.total).toBe(8);
		expect(values(s.aim!.terms)).toEqual(['4', '+0', '+0', '4']);
		expect(s.aim!.scale.filter((r) => r.on).map((r) => r.value)).toEqual(['On target']);
		expect(s.aim!.scale.map((r) => r.label)).toEqual(['8 or more', '5 to 7', '3 to 4', '2 or less']);
		const quality = s.attack.terms[2].parts![0];
		expect(quality.scale!.filter((r) => r.on).map((r) => r.label)).toEqual(['Good']);
		expect(s.attack.terms[0].tip).toBeUndefined();
		expect(values(s.block!.terms)).toEqual(['4', '6', '+3']);
		expect(s.block!.total).toBe(13);
		expect(s.block!.verdict).toBe('Block');
		expect(s.dig).toBeNull();
	});

	it('skips the block when the shot goes around it, and shows the covering defender’s dig', () => {
		// cross past a line block, defender deep is covering: power 4 + 2 = 6, setter (4 + 4) / 2 = 4 → 10;
		// aim 6 + 0 + 0 + 4 = 10 → zone 5, where the deep defender is; dig 4 × 1 + 5 + 3 = 12 → up
		const s = scoreSheet(run(4, { shot: 'cross', block: 'line', stance: 'deep' }, [4, 4, 2, 6, 5]))!;
		expect(s.attack.total).toBe(10);
		expect(s.block).toBeNull();
		expect(s.blockNote).toBe('Blocking line, so the cross goes around');
		expect(values(s.dig!.terms)).toEqual(['4', '5', '+3']);
		expect(s.dig!.terms[0].note).toBeUndefined();
		expect(s.dig!.total).toBe(12);
		expect(s.dig!.totalNote).toBe('Needed 10 to dig it');
		expect(s.dig!.verdict).toBe('Good dig');
	});

	it('shows a defender out of position with their reduced defence', () => {
		// cross past a line block, defender short in 3, ball lands in 5 two zones away: 4 × ¼ = 1, + 6 = 7
		const s = scoreSheet(run(4, { shot: 'cross', block: 'line', stance: 'short' }, [4, 4, 5, 5, 6]))!;
		expect(values(s.dig!.terms)).toEqual(['1', '6']);
		expect(s.dig!.terms[0].note).toBe('4, quartered: out of position');
		expect(s.dig!.verdict).toBe('Kill');
	});

	it('notes when the attack comes off a block touch, with no pass', () => {
		// line into the line block: block 4 + 5 + 3 = 12 vs 12 → touch; then B2 sets 4 − 1 → −1
		const lineIntoBlock = { shot: 'line', block: 'line', stance: 'deep' } as const;
		const s = scoreSheet(run(5, lineIntoBlock, [4, 4, 4, 4, 5, 4]))!;
		expect(s.attack.who).toBe('B1');
		expect(s.setup).toEqual(['Block touch', 'Shaky set']);
		expect(s.note).toBe('Off a block touch: no pass, so −1 on the set and the aim');
		expect(scoreSheet(run(2, lineIntoBlock, [4, 4]))!.note).toBeNull();
	});

	it('leaves the setter’s share out of a tip, so the set is worth only its quality', () => {
		// tip, defender deep: power 4 + 2 = 6; aim 6 → zone 3, two from the deep defender's zone 1
		const s = scoreSheet(run(4, { shot: 'tip', block: 'line', stance: 'deep' }, [4, 4, 2, 6, 3]))!;
		expect(values(s.attack.terms)).toEqual(['4', '2', '+0']);
		expect(s.attack.terms[2].parts).toBeUndefined();
		expect(s.setBonus).toBe(0);
		expect(s.attack.total).toBe(6);
		expect(s.attack.verdict).toBe('Shaky tip');
		expect(s.blockNote).toBe('A tip goes over the block');
	});
});
