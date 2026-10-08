import type { Game } from '../engine/types';

/**
 * How long the court takes to play out each step. The page animates with these, and the online
 * server uses them to start a player's clock once the moves it sent have played out on screen.
 */

/** How long a die tumbles before it shows its value. */
export const ROLL_MS = 600;
/** Time for a player to run to where they roll (matches the chip tween). */
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

/**
 * The longest a chain of steps takes to play on the court: each step's move and roll, and the
 * pauses between them. It counts a move before every roll, so it's never short.
 */
export function playbackMs(chain: Game[]): number {
	let ms = 0;
	chain.forEach((g, i) => {
		if (g.rolls.length) ms += MOVE_MS + RESOLVE_MS;
		if (i < chain.length - 1) ms += pauseAfter(g);
	});
	return ms;
}
