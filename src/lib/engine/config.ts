import type { Slot } from './types';

export const config = {
	targetScore: 21,
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
	touchFirstMod: -1
};
