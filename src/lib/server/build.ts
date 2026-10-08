import pkg from '../../../package.json' with { type: 'json' };
import { rulesFingerprint } from '../engine/replay';

/** The app version saved with each game, for display. */
export const VERSION: string = pkg.version;

/** This build's rules fingerprint: saved with each game, and games under any other one are deleted. Takes about 70 ms. */
export const FINGERPRINT = rulesFingerprint();
