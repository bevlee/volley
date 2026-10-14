export type TeamId = 'A' | 'B';
export type Slot = 'blocker' | 'defender';
/** `over` is a dig over: no swing, a soft ball sent deep (run mode). */
export type Shot = 'line' | 'cross' | 'tip' | 'over';
export type Channel = 'line' | 'cross';
/** Where a serve is aimed: straight at one of the receivers, or the seam between them. */
export type ServeTarget = Slot | 'seam';
export type Stance = 'deep' | 'short';
/** How fast the set is: a fast one is hard to read but harder to aim. */
export type Tempo = 'fast' | 'high';
/**
 * How the blocker plays it: commit to the called channel before the hit, read the hitter and move
 * late, or stay down and help dig.
 */
export type BlockMode = 'commit' | 'read' | 'none';
/** Where the defending side spends a special charge: on the block, on the dig, or not at all. */
export type DefenceSpecial = 'block' | 'dig' | 'none';
export type Zone = 1 | 2 | 3 | 4 | 5 | 6;
export type BlockResult = 'stuff' | 'touch' | 'clean';
export type PointKind = 'shank' | 'guaranteed kill' | 'stuff' | 'kill';
/** How well an attack was aimed: on target, a zone off, straight into the block, or an easy ball over. */
export type AimResult = 'exact' | 'drift' | 'block' | 'easy';
export type RollLabel = 'pass' | 'set' | 'power' | 'pool' | 'aim' | 'block' | 'dig' | 'read' | 'tool';
/** Run-mode abilities: each bends one rule for the player who has it, when they're in that role. */
export type AbilityId =
	| 'tip'
	| 'quick'
	| 'lineSpecialist'
	| 'heavyHitter'
	| 'toolTheBlock'
	| 'liberoInstincts'
	| 'readBlocker'
	| 'wall'
	| 'pancake'
	| 'steadyPasser'
	| 'settersTouch';
/** One attack a hitter could make: a shot and, when tempos are in play, how fast the set is. */
export interface AttackOption {
	shot: Shot;
	tempo?: Tempo;
}

export interface Player {
	name: string;
	slot: Slot;
	attack: number;
	defense: number;
	/** Run mode: the abilities this player has picked up. */
	abilities?: AbilityId[];
}

export interface Team {
	id: TeamId;
	blocker: Player;
	defender: Player;
	/**
	 * Run mode: a team that only hits the run kit (high line and cross, and dig over) plus what its
	 * players' abilities add.
	 */
	runKit?: boolean;
	/** Run mode: an opponent that only attacks in these ways. */
	playbook?: AttackOption[];
}

export interface Calls {
	shot: Shot;
	/** The channel the blocker takes, or (reading) starts on. */
	block: Channel;
	stance: Stance;
	/** Only when sets and blocks have modes (`config.blockModes`). */
	tempo?: Tempo;
	blockMode?: BlockMode;
	/** Special charges spent on this attack, when `config.specials` is on and the side has one. */
	special?: boolean;
	defenceSpecial?: DefenceSpecial;
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
	/** `receiver` is who the serve went to, when serves are aimed; `seam` when it split them. */
	| { kind: 'freeBall'; team: TeamId; receiver?: Slot; seam?: boolean }
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
	/** Each player's special charges, when `config.specials` is on. Earned by their great and perfect touches. */
	pips?: Record<TeamId, Record<Slot, number>>;
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
