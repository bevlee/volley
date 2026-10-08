import type { Shot } from '../engine/types';

/**
 * One word for how well each touch went, so passes, digs, sets and hits read the same way.
 * The numbers stay behind the scenes; the score sheet shows them.
 */
export type Grade = 'Perfect' | 'Good' | 'Shaky' | 'Poor';

/** A penalty to show beside a grade, e.g. " −2"; nothing for a bonus of zero or more, which the grade already says. */
export const penalty = (mod: number) => (mod < 0 ? ` −${-mod}` : '');

/** A pass or dig, by its first-touch bonus (−2 to +2, see rules.firstTouch). */
export function touchGrade(mod: number): Grade {
	if (mod >= 2) return 'Perfect';
	if (mod >= 0) return 'Good';
	return mod === -1 ? 'Shaky' : 'Poor';
}

/** A set, by its quality off the ladder (+2, 0, −1, −2, then −3 and below). */
export function setGrade(mod: number): Grade {
	if (mod >= 2) return 'Perfect';
	if (mod >= 0) return 'Good';
	return mod >= -2 ? 'Shaky' : 'Poor';
}

/**
 * A hit, by its attack total. The bands sit around what a defender covering the shot usually digs
 * (about 10): Perfect beats that comfortably, Good beats it, Shaky is diggable, Poor is an easy dig.
 * Tips never get the setter's share, so they grade on a scale 3 lower. An easy ball over is always poor.
 */
export function hitGrade(attack: number, shot: Shot, misHit = false): Grade {
	if (misHit) return 'Poor';
	const n = shot === 'tip' ? attack + 3 : attack;
	if (n >= 14) return 'Perfect';
	if (n >= 11) return 'Good';
	return n >= 8 ? 'Shaky' : 'Poor';
}
