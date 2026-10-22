import { config } from '../engine/config';

/**
 * The rules are one global, so each page sets them as it opens: advanced mode on /advanced, normal
 * everywhere else. A replay switches to its game's rules once it has loaded it.
 */
export function playRulesOf(routeId: string | null | undefined): void {
	config.advanced = routeId === '/advanced';
}
