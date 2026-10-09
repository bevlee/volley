import { recordGame, replaySteps, type GameRecord, type RecordedCall } from '../engine/replay';
import type { Game } from '../engine/types';
import { playsItself } from './story';

/**
 * Who made the calls in a game against the computer, by each call's place in the game (0 for the
 * first). A call that isn't marked was made entirely by the computer.
 */
export type CallMakers = Map<number, RecordedCall['byComputer']>;

/** How many calls `g` has made so far: the place the next call will take. */
export const callsSoFar = (g: Game) => g.log.filter((e) => e.tag === 'calls').length;

/** The record of a game against the computer, to upload when it's over. */
export const recordVsComputer = (g: Game, makers: CallMakers): GameRecord =>
	recordGame(
		g,
		Array.from({ length: callsSoFar(g) }, (_, i) => makers.get(i) ?? { shot: true, defence: true })
	);

/**
 * Plays a recorded game back in the same chains as live play: each `next()` gives the states up to
 * where the live game would wait again (the next serve or call, or the end of the point).
 */
export function replayer(record: GameRecord) {
	const steps = replaySteps(record);
	const first: Game = steps.next().value!;
	const pull = (): Game | null => {
		const n = steps.next();
		return n.done ? null : n.value;
	};
	return {
		first,
		next(): Game[] {
			const s = pull();
			if (!s) return [];
			const chain = [s];
			let g = s;
			if (g.phase.kind === 'hit') {
				const after = pull();
				if (after) chain.push((g = after));
			}
			for (let n: Game | null; playsItself(g) && (n = pull()); ) chain.push((g = n));
			return chain;
		},
		/** Skips to the end of the current point: its last state, or null at the end of the game. */
		toPointEnd(): Game | null {
			let last: Game | null = null;
			for (let n: Game | null; (n = pull()); ) {
				last = n;
				if (n.phase.kind === 'pointOver' || n.phase.kind === 'gameOver') break;
			}
			return last;
		}
	};
}
