import { pick, type Rng } from './rng';
import type { Calls, Channel, Game, Shot, Stance, TeamId } from './types';

/** Who makes each call. Random for now; a human UI or scripted team implements the same interface later. */
export interface Choosers {
	shot(game: Game, team: TeamId, rng: Rng): Shot;
	block(game: Game, team: TeamId, rng: Rng): Channel;
	stance(game: Game, team: TeamId, rng: Rng): Stance;
}

export const randomChoosers: Choosers = {
	shot: (_game, _team, rng) => pick(rng, ['line', 'cross', 'tip'] as const),
	block: (_game, _team, rng) => pick(rng, ['line', 'cross'] as const),
	stance: (_game, _team, rng) => pick(rng, ['deep', 'short'] as const)
};

/** Always makes the same calls. For tests. */
export const fixedChoosers = (calls: Calls): Choosers => ({
	shot: () => calls.shot,
	block: () => calls.block,
	stance: () => calls.stance
});

/** The player picks the attacking shot; everything else is still called by `base`. */
export const withShot = (shot: Shot, base: Choosers = randomChoosers): Choosers => ({
	...base,
	shot: () => shot
});

/** The player sets the block and the defender's position; everything else is still called by `base`. */
export const withDefence = (block: Channel, stance: Stance, base: Choosers = randomChoosers): Choosers => ({
	...base,
	block: () => block,
	stance: () => stance
});
