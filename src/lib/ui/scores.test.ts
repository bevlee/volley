import { describe, expect, it } from 'vitest';
import { NUMBERED } from '../engine/lineup';
import { fixedChoosers } from '../engine/choosers';
import { newGame, step } from '../engine/rally';
import { scriptedDice } from '../engine/rng';
import type { Calls, Game } from '../engine/types';
import { clearsSheet, scoreSheet, setLine } from './scores';

function evenGame(): Game {
	const g = newGame(1, NUMBERED);
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
		expect(scoreSheet(newGame(1, NUMBERED))).toBeNull();
		expect(scoreSheet(run(1, { shot: 'line', block: 'line', stance: 'deep' }, [4]))).toBeNull();
	});

	it('shows the set’s bonus to the hit, with the power die still to roll, while the play is called', () => {
		// pass 4, set 4 → +0; the setter's share is (4 + set die 4) / 2 = 4, so the set is worth +4
		const s = scoreSheet(run(2, { shot: 'line', block: 'line', stance: 'deep' }, [4, 4]))!;
		expect(s.attack.total).toBeNull();
		expect(s.attack.totalNote).toBe('');
		expect(s.attack.verdict).toBeUndefined();
		expect(s.setup).toEqual(['Good pass', 'Good set']);
		expect(setLine(s)).toBe('Set score 0 + attack bonus 4 on a hard hit');
		expect(s.setBonus).toBe(4);
		expect(s.attackBonus).toBe(4);
		// the pass, the set and the setter bonus are each their own row; the pass is shown aside,
		// since it goes on the set roll rather than the attack
		expect(s.attack.terms.map((t) => t.label)).toEqual([
			"A1's Atk",
			'Power roll',
			'Pass score',
			'Set score',
			"Attack bonus: (A2's Atk 4 + set roll 4) ÷ 2"
		]);
		expect(values(s.attack.terms)).toEqual(['4', '?', '0', '0', '4']);
		const [, , pass, set] = s.attack.terms;
		// the pass and the set sit at the same level, each with its roll in a note
		expect(pass).toMatchObject({ aside: true, note: 'Pass roll 4 (Good). Goes on the set roll, not the attack.' });
		expect(set.note).toBeUndefined();
		expect(set.parts).toBeUndefined();
		// after a pass worth 0, the set table is just the set roll's own bands
		expect(set.scaleOf).toBe('Set roll');
		expect(set.scale!.map((r) => `${r.label}: ${r.value}${r.on ? ' *' : ''}`)).toEqual([
			'6: Perfect, 2',
			'4 or 5: Good, 0 *',
			'3: Shaky, −1',
			'2: Shaky, −2',
			'1: Poor, −3 or worse'
		]);
		expect(s.block).toBeNull();
		expect(s.dig).toBeNull();
	});

	it('adds up a hard attack with the setter’s share, against the block', () => {
		// pass 4, set 4 → +0; power 2 → 6, setter (4 + 4) / 2 = 4 → 10; aim 4 → on target; block 4 + 6 + 3 = 13 → stuff
		const s = scoreSheet(run(4, { shot: 'line', block: 'line', stance: 'deep' }, [4, 4, 2, 4, 6]))!;
		expect(values(s.attack.terms)).toEqual(['4', '2', '0', '0', '4']);
		expect(s.attack.total).toBe(10);
		expect(s.attack.verdict).toBe('Shaky hit');
		const rows = (scale: { label: string; value: string; on: boolean }[] | undefined) =>
			scale?.map((r) => `${r.label}: ${r.value}${r.on ? ' *' : ''}`);
		expect(s.attack.totalOf).toBe('To stop it');
		expect(rows(s.attack.totalScale)).toEqual(["B1's block: 13 or more *", "B2's dig: 10 or more"]);
		expect(s.block!.totalOf).toBe('Against the attack score of 10');
		expect(rows(s.block!.totalScale)).toEqual(['13 or more: Stuffs it *', '8 to 12: Gets a touch', '7 or less: Goes through the block']);
		expect(s.aim?.result).toBe('exact');
		// aim 4 + pass 0 + set 0 + A2's base attack 4 = 8
		expect(s.aim?.total).toBe(8);
		expect(values(s.aim!.terms)).toEqual(['4', '0', '0', '4']);
		expect(s.aim!.terms.map((t) => t.label)).toEqual(['Aim roll', 'Pass score', 'Set score', "A2's Atk (setter)"]);
		expect(setLine(s)).toBe('Aim 8 · on target');
		expect(s.aim!.scale.filter((r) => r.on).map((r) => r.value)).toEqual(['On target']);
		expect(s.aim!.scale.map((r) => r.label)).toEqual(['8 or more', '5 to 7', '3 to 4', '2 or less']);
		const [, , pass, quality] = s.attack.terms;
		// pass roll 4 → Good, 0
		expect(pass.scale!.filter((r) => r.on).map((r) => r.label)).toEqual(['3 or 4']);
		expect(quality.scale!.filter((r) => r.on).map((r) => r.value)).toEqual(['Good, 0']);
		expect(s.attack.terms[0].tip).toBeUndefined();
		expect(values(s.block!.terms)).toEqual(['4', '6', '3']);
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
		expect(s.attack.totalScale?.map((r) => `${r.label}: ${r.value}${r.on ? ' *' : ''}`)).toEqual(["B2's dig: 10 or more *"]);
		expect(values(s.dig!.terms)).toEqual(['4', '5', '3']);
		expect(s.dig!.terms[2]).toMatchObject({ label: 'Read the attack', note: 'B2 was covering the cross that was called.' });
		expect(s.dig!.terms[0].note).toBeUndefined();
		expect(s.dig!.total).toBe(12);
		expect(s.dig!.totalScale?.map((r) => `${r.label}: ${r.value}${r.on ? ' *' : ''}`)).toEqual(['10 or more: Dug up *', '9 or less: Kill']);
		expect(s.dig!.verdict).toBe('Good dig');
	});

	it('shows a defender out of position with their reduced defence', () => {
		// cross past a line block, defender short in 3, ball lands in 5 two zones away: 4 × ¼ = 1, + 6 = 7
		const s = scoreSheet(run(4, { shot: 'cross', block: 'line', stance: 'short' }, [4, 4, 5, 5, 6]))!;
		expect(values(s.dig!.terms)).toEqual(['1', '6']);
		expect(s.dig!.terms[0].note).toBe('Def 4 × 0.25: two or more zones from where it landed');
		// the kill is named on the attack; the dig just missed
		expect(s.dig!.verdict).toBe('Missed');
		expect(s.attack.verdict).toBe('Kill');
	});

	it('names the aim on the card when a badly aimed shot goes into the block', () => {
		// cross past a line block, aim 4 → straight into the block, block 13 vs 10 → stuff
		const s = scoreSheet(run(4, { shot: 'cross', block: 'line', stance: 'deep' }, [4, 3, 4, 1, 6]))!;
		expect(setLine(s)).toBe('Aim 4 · straight into the block');
		expect(s.block!.terms[2].tip).toBe('The aim was so far off the shot went straight into the blocker.');
	});

	it('shows the set table in set-roll numbers for the pass that was made', () => {
		const rows = (s: ReturnType<typeof scoreSheet>) =>
			s!.attack.terms[3].scale!.map((r) => `${r.label}: ${r.value}${r.on ? ' *' : ''}`);
		// a Poor pass (roll 1, −2) needs a set roll 2 higher: a 6 is only Good, and Perfect is out of reach
		expect(rows(scoreSheet(run(2, { shot: 'line', block: 'line', stance: 'deep' }, [1, 6])))).toEqual([
			'6: Good, 0 *',
			'5: Shaky, −1',
			'4: Shaky, −2',
			'3 or less: Poor, −3 or worse'
		]);
		// a Perfect pass (roll 6, +2) lifts the set: 4 or more is Perfect, and Shaky −2 or Poor can't happen
		expect(rows(scoreSheet(run(2, { shot: 'line', block: 'line', stance: 'deep' }, [6, 2])))).toEqual([
			'4 or more: Perfect, 2',
			'2 or 3: Good, 0 *',
			'1: Shaky, −1'
		]);
	});

	it('explains a double six instead of leaving the total blank', () => {
		// pass 4, set 6, power 6 → automatic kill
		const s = scoreSheet(run(4, { shot: 'line', block: 'line', stance: 'deep' }, [4, 6, 6]))!;
		expect(s.attack.total).toBeNull();
		expect(s.attack.verdict).toBe('Double six');
		expect(s.attack.totalNote).toBe('Automatic kill: set roll 6 and power roll 6.');
	});

	it('explains a hitting error from two 1s', () => {
		// pass 4, set 1, power 1 → the hit goes into the net
		const s = scoreSheet(run(4, { shot: 'line', block: 'line', stance: 'deep' }, [4, 1, 1]))!;
		expect(s.attack.verdict).toBe('Error');
		expect(s.attack.totalNote).toBe('Hitting error: set roll 1 and power roll 1.');
	});

	it('says a mis-hit never reaches the block, even when it was aimed around it', () => {
		// pass 2 → −1, set 1 − 1 = 0 → −4, power 3, aim 1 − 1 − 4 + 4 = 0 → easy ball
		const s = scoreSheet(run(4, { shot: 'cross', block: 'line', stance: 'deep' }, [2, 1, 3, 1]))!;
		expect(s.aim?.result).toBe('easy');
		expect(s.blockNote).toBe('Mis-hit: an easy ball over, so no block');
	});

	it('notes when the attack comes off a block touch, with no pass', () => {
		// line into the line block: block 4 + 5 + 3 = 12 vs 12 → touch; then B2 sets 4 − 1 → −1
		const lineIntoBlock = { shot: 'line', block: 'line', stance: 'deep' } as const;
		const s = scoreSheet(run(5, lineIntoBlock, [4, 4, 4, 4, 5, 4]))!;
		expect(s.attack.who).toBe('B1');
		expect(s.setup).toEqual(['Block touch (−1)', 'Shaky set (−1)']);
		expect(s.note).toBe('Off a block touch there’s no pass, so the set and the aim take −1');
		expect(scoreSheet(run(2, lineIntoBlock, [4, 4]))!.note).toBeNull();
	});

	it('leaves the setter’s share out of a tip, so the set is worth only its quality', () => {
		// tip, defender deep: power 4 + 2 = 6; aim 6 → zone 3, two from the deep defender's zone 1
		const s = scoreSheet(run(4, { shot: 'tip', block: 'line', stance: 'deep' }, [4, 4, 2, 6, 3]))!;
		expect(s.attack.terms.map((t) => t.label)).toEqual(["A1's Atk", 'Power roll', 'Pass score', 'Set score']);
		expect(values(s.attack.terms)).toEqual(['4', '2', '0', '0']);
		expect(s.attack.terms[3].note).toBe('Tips don’t get the attack bonus.');
		expect(s.setBonus).toBe(0);
		expect(s.attack.total).toBe(6);
		// the dig can't reach it, so the attack's result is the kill rather than its grade
		expect(s.attack.verdict).toBe('Tip kill');
		expect(s.blockNote).toBe('A tip goes over the block');
	});
});

describe('clearsSheet', () => {
	const line = { shot: 'line', block: 'line', stance: 'deep' } as const;

	it('clears the last attack once a new possession starts with a pass, or a new rally starts', () => {
		expect(clearsSheet(run(1, line, [4]))).toBe(true);
		const rallyOver = run(4, line, [4, 4, 2, 4, 6]);
		expect(clearsSheet(rallyOver)).toBe(false);
		expect(clearsSheet(step(rallyOver))).toBe(true);
	});

	it('clears it when a point ends without an attack, like two 1s on the pass and set', () => {
		expect(clearsSheet(run(2, line, [1, 1]))).toBe(true);
	});

	it('keeps it through the set and the attack', () => {
		expect(clearsSheet(run(2, line, [4, 4]))).toBe(false);
		expect(clearsSheet(run(4, line, [4, 4, 2, 4, 6]))).toBe(false);
	});
});
