import type { Channel, ReadOutcome, Shot, Slot, Tempo, Touch } from './types';

export const config = {
	/** Short games: first to 7, win by 2. */
	targetScore: 7,
	winBy: 2,
	blockBonus: 3,
	readBonus: 3,
	blockMargin: 3,
	accuracyExact: 8,
	accuracyEasy: 2,
	/** A hard shot aimed this badly (but better than easy) goes straight into the block. */
	accuracyIntoBlock: 4,
	/** Defense multiplier by distance to the landing zone: same zone, one step, two or more. */
	reach: [1, 0.5, 0.25],
	partnerPoolOnAttack: true,
	partnerPoolOnDig: false,
	freeBallReceiver: 'blocker' as Slot,
	/** A block touch is the first contact, so there's no pass: this stands in for the pass bonus on the set and aim. */
	touchFirstMod: -1,
	/**
	 * The worst set (set modifier) each shot can be hit off; null means it's always on. All on for now:
	 * the sim tries cut-offs (npm run sim:gating).
	 */
	minSet: { line: null, cross: null, tip: null } as Partial<Record<Shot, number | null>>,
	/**
	 * Aimed serves: the server picks a receiver or the seam, and a serve's pass adds the passer's
	 * defense (centred on 4). Off for now: the sim tries it (npm run sim:serve).
	 */
	serveTargets: false,
	/** The pass off a serve into the seam: both receivers hesitate. */
	seamPassMod: -1,
	/**
	 * Set tempos and block modes: the setter goes fast or high, and the blocker commits, reads or
	 * stays down. Off for now: the sim tries it (npm run sim:blocks).
	 */
	blockModes: false,
	/**
	 * Advanced mode, tempo flow: the set decides the tempo, with no call. A set this good is a quick
	 * ball (hard line or cross, and the defence calls only the block); anything worse is a high ball,
	 * where the hitter places a shot: line or cross, hit hard, tipped or rolled. Normal games only, and
	 * not with `blockModes`. Off for now: the sim tries it (npm run sim:tempo).
	 */
	advanced: false,
	quickBallMinSet: 2,
	/**
	 * The worst set each high-ball shot can be hit off; null means it's always on. All on: hitting
	 * hard off a bad set is a call to get right, not one to take away (npm run sim:depth: gating hard
	 * below −2 costs a point of balanced vs random in 100).
	 */
	highBallMinSet: {
		line: { hard: null, tip: null, roll: null },
		cross: { hard: null, tip: null, roll: null }
	} as Record<Channel, Record<Touch, number | null>>,
	/**
	 * The block's bonus on a quick ball down its channel, in place of `blockBonus`. A guess the other
	 * way is already a kill, so this is what keeps a great set from scoring four times in five.
	 */
	quickBlockBonus: 8,
	/**
	 * Advanced mode: the dig's reach and bonus by how the defender read the shot. Reach multiplies
	 * defense, so a generous close row (half reach) hands a strong digger most balls without the read.
	 * A read is worth 4, a point more than in normal games, so a defence call costs more to miss.
	 */
	tempoDig: {
		read: { reach: 1, bonus: 4 },
		close: { reach: 0.25, bonus: 1 },
		wrong: { reach: 0, bonus: 0 }
	} as Record<ReadOutcome, { reach: number; bonus: number }>,
	/**
	 * Advanced mode: what each touch's power and aim take from the set (`set` times the set modifier,
	 * plus `bonus`), on top of the hitter's attack and the die. A hard hit takes the set twice over, so
	 * it's the shot off a good set and a mistake off a bad one; a roll and a tip hit the same off any
	 * set, softer, and a roll needs a good set to aim. With every touch as strong as a hit, a ball
	 * nobody reads is a kill whatever the touch, and no call is better than another (npm run sim:depth).
	 */
	touchPower: {
		hard: { set: 2, bonus: 0 },
		tip: { set: 0, bonus: -4 },
		roll: { set: 0, bonus: -1 }
	} as Record<Touch, { set: number; bonus: number }>,
	touchAim: {
		hard: { set: 1, bonus: 0 },
		tip: { set: 1, bonus: 0 },
		roll: { set: 2, bonus: 0 }
	} as Record<Touch, { set: number; bonus: number }>,
	/**
	 * Advanced mode: against a high ball the blocker can stay down instead of blocking: no block, and
	 * every ball is a close read for the dig, with `noBlockDigBonus` for the help. Right against a
	 * soft shot, wrong against a hard one. Without it, blocking cost nothing, and the defence's only
	 * call that mattered was deep or short.
	 */
	stayDown: true,
	/** A fast set is harder to aim. */
	fastAccuracyMod: -2,
	/** A reading blocker gets to a shot down the other channel on a d6 this high or lower. */
	readChance: { fast: 2, high: 5 } as Record<Tempo, number>,
	/** A read block is late: less hand over the net than a committed one (`blockBonus`). */
	readBlockBonus: 2,
	/** With the blocker down off the net, the dig gets help. */
	noBlockDigBonus: 2,
	/**
	 * Special charges, each player's own: a great touch (pass or dig +1, set +2) earns the player 1, a
	 * perfect one (pass or dig +2) earns 2, up to `maxPips`. The hitter can spend one on the hit for
	 * accuracy and power; the blocker or digger on their block or dig. Off for now: the sim tries it
	 * (npm run sim:specials).
	 */
	specials: false,
	maxPips: 4,
	specialHitPower: 2,
	specialHitAccuracy: 2,
	specialBlock: 4,
	specialDig: 4,
	/**
	 * A dig over (run mode): no swing, so its power is this plus the power roll, with no set or setter
	 * bonus. At 3, against the first run opponent, always playing short loses about 3 matches in 4 and
	 * playing deep wins nearly all of them.
	 */
	overPower: 3,
	/** Run mode: a quick set needs a set this good, unless the hitter has Scrappy quick. */
	quickMinSet: 0,
	/**
	 * What each run-mode ability changes. Sized with the sim (scripts/abilities-impact) to be worth
	 * roughly 2 to 4 points in 100 to the player it suits.
	 */
	abilities: {
		/** Quick: this hitter's quick sets aim at this (instead of everyone else's `fastAccuracyMod`), and hit harder. */
		quickAim: 0,
		quickPower: 1,
		/** Line specialist hits line off sets this much worse than everyone else, and harder. */
		lineSpecialistSets: 1,
		lineSpecialistPower: 1,
		heavyHitterPower: 1,
		heavyHitterAim: -1,
		/** Tool the block: a block touch goes off the hands for a point on a d6 this high or higher. */
		toolTheBlockOn: 5,
		/** Libero instincts: better digs, and a dig that comes up reads this much better as a first touch. */
		liberoDig: 2,
		liberoTouch: 1,
		wallBlock: 1,
		/** Soft block: this blocker's block touches count this much as a first touch (everyone else's: `touchFirstMod`). */
		softBlockTouch: 1,
		/** Pancake: reach for a ball one zone away. */
		pancakeReach: 1,
		/** Steady passer: added to this player's pass rolls. */
		steadyPass: 1,
		/** Setter's touch: this player's set rolls of this or more (short of a 6) count one higher. */
		settersTouchFrom: 4
	}
};
