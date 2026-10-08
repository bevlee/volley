import { firstTouch } from '../engine/rules';
import type { Game, TeamId } from '../engine/types';
import { penalty, setGrade, touchGrade } from './grades';

/**
 * How the attack the scoreline is showing was built, for the bar under the controls: its first touch
 * (a pass, a dig or a block touch) and its set. A dig or block touch belongs to the next attack, so it
 * shows once that attack's set is played; until then the bar keeps the attack in the scoreline.
 */

export interface Touch {
	/** What happened: "Pass", "Dig", "Block" (a touch) or "Set". */
	label: string;
	team: TeamId;
	who: string;
	/** How it went, e.g. "Good", "Poor −2" or "Touch 12". */
	result: string;
}

export function buildUp(g: Game): Touch[] {
	let shown: Touch[] = [];
	/** A dig or block touch, waiting for its set. */
	let next: Touch | null = null;
	for (const e of g.log) {
		if (e.rally !== g.rally || !e.data) continue;
		const d = e.data;
		const at = { team: d.team as TeamId, who: String(d.player) };
		const mod = Number(d.mod);
		if (e.tag === 'pass') {
			shown = [{ ...at, label: 'Pass', result: touchGrade(mod) + penalty(mod) }];
			next = null;
		} else if (e.tag === 'dig' && d.up) {
			const first = firstTouch(Number(d.die));
			next = { ...at, label: 'Dig', result: touchGrade(first) + penalty(first) };
		} else if (e.tag === 'block' && d.result === 'touch') {
			next = { ...at, label: 'Block', result: `Touch ${d.total}` };
		} else if (e.tag === 'set') {
			shown = [next ?? shown[0], { ...at, label: 'Set', result: setGrade(mod) + penalty(mod) }];
			next = null;
		}
	}
	return shown;
}
