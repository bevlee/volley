import { config } from './config';
import { pick, type Rng } from './rng';
import { attackOptionsIn, availableSpends, blockModesIn, blocksIn } from './rules';
import type { BlockMode, Calls, Channel, DefenceSpecial, Game, ServeTarget, Shot, Stance, TeamId, Tempo, Touch } from './types';

export const SERVE_TARGETS: readonly ServeTarget[] = ['blocker', 'defender', 'seam'];
export const TEMPOS: readonly Tempo[] = ['fast', 'high'];
export const BLOCK_MODES: readonly BlockMode[] = ['commit', 'read', 'none'];

/**
 * Who makes each call. Calls come after the set, so a chooser can see it: shots and blocks come from
 * what that set (and, in run mode, the hitter's abilities or the team's playbook) leaves on.
 */
export interface Choosers {
	shot(game: Game, team: TeamId, rng: Rng): Shot;
	block(game: Game, team: TeamId, rng: Rng): Channel;
	stance(game: Game, team: TeamId, rng: Rng): Stance;
	/** Where to serve, when serves are aimed (`config.serveTargets`). Random when left out. */
	serve?(game: Game, team: TeamId, rng: Rng): ServeTarget;
	/** The attacking side's set tempo and the defending side's block mode, when `config.blockModes` is on. Random when left out. */
	tempo?(game: Game, team: TeamId, rng: Rng): Tempo;
	blockMode?(game: Game, team: TeamId, rng: Rng): BlockMode;
	/** How to play the shot already called, in advanced mode (`config.advanced`). Random when left out. */
	touch?(game: Game, team: TeamId, rng: Rng): Touch;
	/** Whether to spend a special charge, when `config.specials` is on and the hitter (or the blocker or digger) has one. Random when left out. */
	special?(game: Game, team: TeamId, rng: Rng): boolean;
	defenceSpecial?(game: Game, team: TeamId, rng: Rng): DefenceSpecial;
}

export const randomChoosers: Choosers = {
	shot: (game, _team, rng) => pick(rng, [...new Set(attackOptionsIn(game).map((o) => o.shot))]),
	block: (game, _team, rng) => pick(rng, blocksIn(game)),
	stance: (_game, _team, rng) => pick(rng, ['deep', 'short'] as const),
	serve: (_game, _team, rng) => pick(rng, SERVE_TARGETS),
	// The tempos open for the shot already called.
	tempo: (game, _team, rng) => {
		const shot = game.attack!.calls?.shot;
		const tempos = attackOptionsIn(game).flatMap((o) => (o.shot === shot && o.tempo ? [o.tempo] : []));
		return pick(rng, tempos.length ? tempos : TEMPOS);
	},
	// Advanced mode: staying down is one of the blocker's three jobs, with blocking line and blocking cross.
	blockMode: (game, _team, rng) =>
		pick(rng, config.blockModes ? blockModesIn(game) : [...blocksIn(game).map(() => 'commit' as const), 'none' as const]),
	// The touches open for the shot already called.
	touch: (game, _team, rng) => {
		const shot = game.attack!.calls!.shot;
		return pick(rng, attackOptionsIn(game).flatMap((o) => (o.shot === shot && o.touch ? [o.touch] : [])));
	},
	special: (_game, _team, rng) => pick(rng, [false, true]),
	defenceSpecial: (game, team, rng) => pick(rng, availableSpends(game.pips![team]))
};

/** Each team makes its own calls: `shot` goes to the attacking side, `block` and `stance` to the defending side. */
export const byTeam = (teams: Record<TeamId, Choosers>): Choosers => ({
	shot: (game, team, rng) => teams[team].shot(game, team, rng),
	block: (game, team, rng) => teams[team].block(game, team, rng),
	stance: (game, team, rng) => teams[team].stance(game, team, rng),
	serve: (game, team, rng) => (teams[team].serve ?? randomChoosers.serve!)(game, team, rng),
	tempo: (game, team, rng) => (teams[team].tempo ?? randomChoosers.tempo!)(game, team, rng),
	blockMode: (game, team, rng) => (teams[team].blockMode ?? randomChoosers.blockMode!)(game, team, rng),
	touch: (game, team, rng) => (teams[team].touch ?? randomChoosers.touch!)(game, team, rng),
	special: (game, team, rng) => (teams[team].special ?? randomChoosers.special!)(game, team, rng),
	defenceSpecial: (game, team, rng) => (teams[team].defenceSpecial ?? randomChoosers.defenceSpecial!)(game, team, rng)
});

/** Always makes the same calls. For tests. */
export const fixedChoosers = (calls: Calls): Choosers => ({
	shot: () => calls.shot,
	block: () => calls.block,
	stance: () => calls.stance,
	...(calls.tempo && { tempo: () => calls.tempo! }),
	...(calls.blockMode && { blockMode: () => calls.blockMode! }),
	...(calls.touch && { touch: () => calls.touch! }),
	...(calls.special !== undefined && { special: () => calls.special! }),
	...(calls.defenceSpecial && { defenceSpecial: () => calls.defenceSpecial! })
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
