import type { Slot, TeamId } from './types';

/**
 * Who plays: four Haikyu!! players with fixed stats, the same every game. Attack drives hitting,
 * and a setter's attack drives the set and the aim; defense drives blocking (the blocker) and
 * digging (the defender).
 *
 * Balanced by simulation, not by totals: equal totals (8 and 8 each side) left A winning only 40%,
 * because the blocker's defense counts for more than the sums suggest. With Kageyama at 5/2, A wins
 * 48% ±1 of 8,000 random-call games, from either side of the net. A single point can move that by
 * 10 or more, so re-run the check after any change.
 */
export interface Character {
	name: string;
	attack: number;
	defense: number;
}

export type Lineup = Record<TeamId, Record<Slot, Character>>;

export const LINEUP: Lineup = {
	A: {
		/** The decoy middle blocker: a huge jump and a fierce hit, but blocks and digs badly. */
		blocker: { name: 'Hinata', attack: 6, defense: 2 },
		/** The libero: digs anything, barely hits. */
		defender: { name: 'Nishinoya', attack: 2, defense: 6 }
	},
	B: {
		/** The blocker: reads the hitter and walls the net, a modest hitter. */
		blocker: { name: 'Tsukishima', attack: 3, defense: 5 },
		/** The setter: precise sets make his partner's hits land, and he can hit himself; a poor digger. */
		defender: { name: 'Kageyama', attack: 5, defense: 2 }
	}
};

/** Plain players numbered by team, all stats 4: for tests about the rules rather than the characters. */
export const NUMBERED: Lineup = {
	A: { blocker: { name: 'A1', attack: 4, defense: 4 }, defender: { name: 'A2', attack: 4, defense: 4 } },
	B: { blocker: { name: 'B1', attack: 4, defense: 4 }, defender: { name: 'B2', attack: 4, defense: 4 } }
};
