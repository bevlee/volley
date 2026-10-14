import type { Game } from '../engine/types';

/**
 * How long the court takes to play out each step, at normal pace. choreo.ts lays a step out with
 * these, and the online server uses its total to bound how long a screen takes to catch up.
 */

/** How long a die tumbles before it shows its value. */
export const ROLL_MS = 600;
/** Time for a player to run to a new spot. */
export const MOVE_MS = 400;
/** Pause after the dice land before the step's result is shown. */
export const RESOLVE_MS = ROLL_MS + 150;
/** Pauses between steps that play on their own: after the calls are revealed, after the attack, otherwise. */
export const AFTER_CALLS_MS = 900;
export const AFTER_ATTACK_MS = 1300;
export const BETWEEN_MS = 250;

/** The pause after `g` is shown before the next step in a chain plays. */
export const pauseAfter = (g: Game) =>
	g.phase.kind === 'hit'
		? AFTER_CALLS_MS
		: g.log.slice(g.logStart).some((e) => e.tag === 'hit')
			? AFTER_ATTACK_MS
			: BETWEEN_MS;

export type FlightKind = 'spike' | 'tip' | 'serve' | 'lob' | 'drop' | 'deflect';

/** How high (viewBox units) and how long (ms) each kind of ball flies. */
export const FLIGHT: Record<FlightKind, { apex: number; ms: number }> = {
	spike: { apex: 10, ms: 280 },
	tip: { apex: 45, ms: 520 },
	serve: { apex: 80, ms: 760 },
	lob: { apex: 55, ms: 560 },
	/** Off the block, stuffed: a short fall from the net. */
	drop: { apex: 18, ms: 380 },
	/** Off the block, touched: up and back to the defender running in to set it. */
	deflect: { apex: 40, ms: 520 }
};
