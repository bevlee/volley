import { config } from '../engine/config';

/** Every rule a page can change, as the app starts with them. */
const DEFAULTS = structuredClone({
	advanced: config.advanced,
	blockModes: config.blockModes,
	minSet: config.minSet,
	specials: config.specials,
	serveTargets: config.serveTargets
});

/**
 * The rules are one global, so each page starts from the defaults as it opens, then sets its own:
 * advanced mode on /advanced, a run's rules from the run (`useRunRules`), and a replay its game's
 * rules once it has loaded it.
 */
export function playRulesOf(routeId: string | null | undefined): void {
	Object.assign(config, structuredClone(DEFAULTS), { advanced: routeId === '/advanced' });
}
