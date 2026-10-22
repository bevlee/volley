import pkg from '../../../package.json' with { type: 'json' };
import { rulesFingerprint } from '../engine/replay';
import type { Rules } from '../engine/types';

/** The app version saved with each game, for display. */
export const VERSION: string = pkg.version;

/** This build's fingerprint for each rule set, saved with each game played under it. Takes about 150 ms. */
export const FINGERPRINTS: Record<Rules, string> = { normal: rulesFingerprint('normal'), advanced: rulesFingerprint('advanced') };

/** The fingerprints a saved game can have and still replay; games under any other are deleted. */
export const CURRENT: readonly string[] = Object.values(FINGERPRINTS);
