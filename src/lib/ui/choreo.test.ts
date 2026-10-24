import { describe, expect, it } from 'vitest';
import { fixedChoosers } from '../engine/choosers';
import { NUMBERED } from '../engine/lineup';
import { newGame, step } from '../engine/rally';
import { scriptedDice } from '../engine/rng';
import type { Calls, Game, TeamId } from '../engine/types';
import { choreograph, holdAfter, playbackMs, sample, spotsOf, still, type Timeline } from './choreo';
import { blockBar, positions, previewDefence, SET_SPOT, VIEW, zoneCenter, type Point } from './layout';
import { stepEntries } from './story';
import { FLIGHT, MOVE_MS, RESOLVE_MS } from './timing';

/** Every step of a seeded game, as [before, after]. */
function stepsOf(seed: number): [Game, Game][] {
	const pairs: [Game, Game][] = [];
	let g = newGame(seed);
	while (g.phase.kind !== 'gameOver') {
		const next = step(g);
		pairs.push([g, next]);
		g = next;
	}
	return pairs;
}

/** A rally from the start with scripted dice and calls: each step, as [before, after], and its timeline. */
function scripted(calls: Calls, dice: number[], steps: number) {
	const choosers = fixedChoosers(calls);
	const rng = scriptedDice(dice);
	const out: { prev: Game; next: Game; tl: Timeline }[] = [];
	let g = newGame(1, NUMBERED);
	for (let i = 0; i < steps; i++) {
		const next = step(g, choosers, rng);
		out.push({ prev: g, next, tl: choreograph(g, next) });
		g = next;
	}
	return out;
}

const tagged = (g: Game, tag: string) => stepEntries(g).find((e) => e.tag === tag)?.data;
const end = (l: { at: number; ms: number }) => l.at + l.ms;
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const held = (p: Point) => ({ x: p.x + (p.y > 280 ? -34 : 34), y: p.y - 20 });

describe('every step of a game', () => {
	const games = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((seed) => stepsOf(seed));

	it.each(['A', 'B'] as TeamId[])('starts where the court was and ends where it rests, with %s at the bottom', (bottom) => {
		for (const [prev, next] of games) {
			const tl = choreograph(prev, next, { bottom });
			const before = still(prev, positions(prev), bottom);
			const after = still(next, positions(next), bottom);
			const first = sample(tl, 0);
			const last = sample(tl, tl.duration);
			expect(first.spots).toEqual(before.spots);
			expect({ x: first.ball.x, y: first.ball.y }).toEqual({ x: before.ball.x, y: before.ball.y });
			expect(last.spots).toEqual(after.spots);
			expect(last.ball.x).toBeCloseTo(after.ball.x);
			expect(last.ball.y).toBeCloseTo(after.ball.y);
			expect(last.actions).toEqual(after.actions);
		}
	});

	it('never jumps the ball: each flight starts where the last one ended, and it moves smoothly', () => {
		for (const [prev, next] of games) {
			const tl = choreograph(prev, next);
			let at = tl.start.ball;
			for (const leg of tl.legs) {
				expect(leg.from).toEqual(at);
				at = leg.to;
			}
			let ball = sample(tl, 0).ball;
			for (let t = 8; t <= tl.duration; t += 8) {
				const now = sample(tl, t).ball;
				expect(dist(now, ball)).toBeLessThan(20);
				ball = now;
			}
		}
	});

	it('plays its beats in order: the dice roll, the court shows the result, then the ball lands', () => {
		for (const [prev, next] of games) {
			const tl = choreograph(prev, next);
			if (tl.roll) expect(tl.revealAt).toBe(tl.roll.at + RESOLVE_MS);
			expect(tl.landAt).toBeGreaterThanOrEqual(tl.revealAt);
			expect(tl.duration).toBeGreaterThanOrEqual(tl.landAt);
			// nothing about the result moves before the dice that decide it have settled
			for (const leg of tl.legs) if (leg.at < tl.revealAt) expect(end(leg)).toBeLessThanOrEqual(tl.roll?.at ?? tl.revealAt);
			for (const a of tl.actions) expect(a.at).toBeGreaterThanOrEqual(tl.revealAt);
		}
	});

	it('tells a result when the ball lands, and a serve, pass or set as it is played', () => {
		for (const [prev, next] of games) {
			const tl = choreograph(prev, next);
			const result = ['dig', 'block', 'point'].some((t) => tagged(next, t));
			expect(tl.tellAt).toBe(result ? tl.landAt : tl.revealAt);
		}
	});

	it('floats an easy ball over rather than spiking it', () => {
		const easy = games.filter(([, next]) => tagged(next, 'accuracy')?.result === 'easy');
		expect(easy.length).toBeGreaterThan(0);
		for (const [prev, next] of easy) expect(choreograph(prev, next).legs.at(-1)?.kind).toBe('lob');
	});

	it('jumps the block as the ball reaches the net, even when it gets past', () => {
		const clean = games.filter(([, next]) => tagged(next, 'block')?.result === 'clean');
		expect(clean.length).toBeGreaterThan(0);
		for (const [prev, next] of clean) {
			const tl = choreograph(prev, next);
			const block = tl.actions.find((a) => a.action.move === 'block')!;
			expect(block.at).toBeGreaterThan(tl.revealAt);
			expect(block.at).toBeLessThan(tl.landAt);
			const ball = sample(tl, block.at).ball;
			expect(Math.abs(ball.ground.y - VIEW.netY)).toBeLessThan(1);
		}
	});
});

describe('a block touch', () => {
	// pass 4, set 4, power 1, aim 3 (straight into the line block), block 1: a touch; then the set off it
	const rally = scripted({ shot: 'line', block: 'line', stance: 'deep' }, [4, 4, 1, 3, 1, 4], 6);
	const touch = rally.find((s) => tagged(s.next, 'block')?.result === 'touch')!;
	const setOff = rally[rally.indexOf(touch) + 1];

	it('flies the ball into the block, then off it to the defender running in to set', () => {
		const { tl } = touch;
		expect(tl.legs.map((l) => l.kind)).toEqual(['spike', 'deflect']);
		const [into, off] = tl.legs;
		// the hands are on the block that was called
		const bar = blockBar('B', 'line');
		expect(into.to.y).toBe(VIEW.netY);
		expect(into.to.x).toBeGreaterThanOrEqual(bar.x);
		expect(into.to.x).toBeLessThanOrEqual(bar.x + bar.w);
		// and it comes off to B's defender on the setting spot, never to the blocker
		expect(off.to).toEqual(held(zoneCenter('B', SET_SPOT)));
		expect(sample(tl, tl.duration).spots.B.defender).toEqual(zoneCenter('B', SET_SPOT));
	});

	it('jumps the blocker as the ball meets the block, and tells it once the ball is off it', () => {
		const { tl } = touch;
		const block = tl.actions.find((a) => a.action.move === 'block')!;
		expect(block.at).toBe(end(tl.legs[0]));
		expect(tl.landAt).toBe(end(tl.legs[1]));
	});

	it('sets straight off the touch: no pass in between', () => {
		expect(setOff.next.attack?.source).toBe('touch');
		const { tl } = setOff;
		// nothing flies before the set roll; the one flight is the set, to B's blocker coming in to hit
		expect(tl.legs).toHaveLength(1);
		expect(tl.legs[0].at).toBe(tl.revealAt);
		expect(tl.legs[0].from).toEqual(held(zoneCenter('B', SET_SPOT)));
		expect(tl.legs[0].to).toEqual(held(zoneCenter('B', 4)));
	});
});

describe('a stuff block', () => {
	// pass 4, set 4, power 1, aim 6 (on target, down the blocked line), block 6
	const rally = scripted({ shot: 'line', block: 'line', stance: 'deep' }, [4, 4, 1, 6, 6], 5);
	const { next, tl } = rally.at(-1)!;

	it('drops the ball off the block and only then tells the point', () => {
		expect(tagged(next, 'point')?.kind).toBe('stuff');
		expect(tl.legs.map((l) => l.kind)).toEqual(['spike', 'drop']);
		const block = tl.actions.find((a) => a.action.move === 'block')!;
		expect(block.at).toBe(end(tl.legs[0]));
		expect(tl.landAt).toBe(end(tl.legs[1]));
		expect(tl.landAt).toBeGreaterThan(block.at);
	});
});

describe('a dig', () => {
	// pass 4, set 4, power 1, aim 6 (cross, past the line block), dig 6: up; then the set
	const rally = scripted({ shot: 'cross', block: 'line', stance: 'deep' }, [4, 4, 1, 6, 6, 4], 6);
	const dig = rally.find((s) => tagged(s.next, 'dig'))!;
	const setOff = rally[rally.indexOf(dig) + 1];

	it('plays the dig as the ball comes down', () => {
		expect(tagged(dig.next, 'dig')?.up).toBe(true);
		const digger = dig.tl.actions.find((a) => a.key === 'B-defender')!;
		expect(digger.at).toBe(dig.tl.landAt);
		const hitter = dig.tl.actions.find((a) => a.key === 'A-blocker')!;
		expect(hitter.at).toBe(dig.tl.revealAt);
	});

	it('flies the dig to the setter as they run to the spot, and rolls the set once it arrives', () => {
		const { tl } = setOff;
		const [toSetter, set] = tl.legs;
		expect(toSetter.at).toBe(0);
		expect(toSetter.to).toEqual(held(zoneCenter('B', SET_SPOT)));
		expect(tl.roll!.at).toBe(end(toSetter));
		expect(set.at).toBe(tl.revealAt);
	});
});

describe('the defence being set up', () => {
	it('starts the reveal from the spots the player chose, not from the ready position', () => {
		const rally = scripted({ shot: 'line', block: 'cross', stance: 'deep' }, [4, 4], 4);
		const calls = rally.find((s) => s.next.phase.kind === 'hit')!;
		const chosen = previewDefence(calls.prev, { block: 'cross', stance: 'deep' });
		const tl = choreograph(calls.prev, calls.next, { start: chosen });
		expect(sample(tl, 0).spots).toEqual(spotsOf(chosen));
		// the call was what they were showing, so nobody moves
		expect(tl.glides).toEqual([]);
	});
});

describe('playbackMs', () => {
	it('adds up each step and the pauses between them', () => {
		const rally = scripted({ shot: 'line', block: 'line', stance: 'deep' }, [4, 4, 1, 6, 6], 4);
		const [a, b] = rally;
		expect(playbackMs(a.prev, [a.next])).toBe(a.tl.duration);
		expect(playbackMs(a.prev, [a.next, b.next])).toBe(a.tl.duration + holdAfter(a.tl, a.next) + b.tl.duration);
	});

	it('takes as long as a pass and set take to play', () => {
		const rally = scripted({ shot: 'line', block: 'line', stance: 'deep' }, [4, 4], 3);
		const set = rally[2].tl;
		// the pass flies to the setter as they run, the set is rolled, then flies to the hitter
		expect(set.duration).toBe(FLIGHT.lob.ms + RESOLVE_MS + Math.max(FLIGHT.lob.ms, MOVE_MS));
	});
});
