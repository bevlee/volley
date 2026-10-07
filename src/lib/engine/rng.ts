export interface Rng {
	next(): number;
}

export interface SeededRng extends Rng {
	readonly state: number;
}

/** mulberry32: small, fast and seedable. Pass `state` back in to resume the same sequence. */
export function mulberry32(seed: number): SeededRng {
	let a = seed >>> 0;
	return {
		next() {
			a = (a + 0x6d2b79f5) >>> 0;
			let t = a;
			t = Math.imul(t ^ (t >>> 15), t | 1);
			t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		},
		get state() {
			return a;
		}
	};
}

/** Test RNG: each d6() call returns the next die in the list. Throws when it runs out. */
export function scriptedDice(dice: number[]): Rng {
	let i = 0;
	return {
		next() {
			if (i >= dice.length) throw new Error(`scriptedDice ran out after ${dice.length} rolls`);
			return (dice[i++] - 0.5) / 6;
		}
	};
}

export const d6 = (rng: Rng) => Math.floor(rng.next() * 6) + 1;

export const int = (rng: Rng, min: number, max: number) =>
	min + Math.floor(rng.next() * (max - min + 1));

export const pick = <T>(rng: Rng, items: readonly T[]): T =>
	items[Math.floor(rng.next() * items.length)];
