import type { Slot } from './types';

export const config = {
	statMin: 3,
	statMax: 6,
	targetScore: 21,
	winBy: 2,
	blockBonus: 3,
	readBonus: 1,
	blockMargin: 3,
	accuracyExact: 8,
	accuracyEasy: 2,
	/** Defense multiplier by distance to the landing zone: same zone, one step, two or more. */
	reach: [1, 0.5, 0.25],
	partnerPoolOnAttack: true,
	partnerPoolOnDig: false,
	freeBallReceiver: 'blocker' as Slot
};
