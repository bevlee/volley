export type TeamId = 'A' | 'B';
export type Slot = 'blocker' | 'defender';
export type Shot = 'line' | 'cross' | 'tip';
export type Channel = 'line' | 'cross';
export type Stance = 'deep' | 'short';
export type Zone = 1 | 2 | 3 | 4 | 5 | 6;
export type BlockResult = 'stuff' | 'touch' | 'clean';
export type PointKind = 'shank' | 'guaranteed kill' | 'stuff' | 'kill';
/** How well an attack was aimed: on target, a zone off, straight into the block, or an easy ball over. */
export type AimResult = 'exact' | 'drift' | 'block' | 'easy';
export type RollLabel = 'pass' | 'set' | 'power' | 'pool' | 'aim' | 'block' | 'dig';

export interface Player {
	name: string;
	slot: Slot;
	attack: number;
	defense: number;
}

export interface Team {
	id: TeamId;
	blocker: Player;
	defender: Player;
}

export interface Calls {
	shot: Shot;
	block: Channel;
	stance: Stance;
}

/** Everything rolled so far by the side currently attacking, filled in phase by phase. */
export interface Attack {
	team: TeamId;
	hitter: Slot;
	/** How this side got the ball: a pass of a serve or free ball, a dig, or a block touch. */
	source: 'free' | 'dig' | 'touch';
	/** Where the dig was played, when `source` is 'dig'. */
	dugAt?: Zone;
	firstDie: number;
	firstMod: number;
	setDie?: number;
	setMod?: number;
	calls?: Calls;
	powerDie?: number;
	incoming?: number;
	accuracy?: number;
	landing?: Zone;
	aim?: AimResult;
	digDie?: number;
	/** The defending blocker's die, kept when they touch the ball: it's their side's first contact. */
	blockDie?: number;
}

export type Phase =
	/** The serving team's server holds the ball; the next step serves it over. */
	| { kind: 'serve'; team: TeamId }
	| { kind: 'freeBall'; team: TeamId }
	| { kind: 'set' }
	| { kind: 'calls' }
	| { kind: 'hit' }
	/** The ball was dug up; the next step turns the digger into the hitter and rolls the set. */
	| { kind: 'dug' }
	/** The blocker got a touch on the ball. In beach that's their side's first contact, so the next step is the set. */
	| { kind: 'touched' }
	| { kind: 'pointOver' }
	| { kind: 'gameOver' };

/** One die rolled during a step, and who rolled it. */
export interface Roll {
	team: TeamId;
	slot: Slot;
	die: number;
	label: RollLabel;
}

export interface LogEntry {
	rally: number;
	text: string;
	/** Machine-readable tag for the sim script and UI: 'calls', 'accuracy', 'block', 'dig' or 'point'. */
	tag?: string;
	data?: Record<string, string | number | boolean>;
}

export interface Game {
	seed: number;
	rngState: number;
	teams: Record<TeamId, Team>;
	score: Record<TeamId, number>;
	serving: TeamId;
	/** Who serves next for each team; flips each time that team wins the serve back. */
	servers: Record<TeamId, Slot>;
	rally: number;
	phase: Phase;
	attack: Attack | null;
	log: LogEntry[];
	/** Index in `log` where the most recent step's entries start. */
	logStart: number;
	/** Dice rolled in the most recent step, for the court to animate. */
	rolls: Roll[];
	/** Steps taken so far; changes every step, so the UI can tell a new roll from an old one. */
	steps: number;
	winner: TeamId | null;
}
