import { cleanName } from './names';

/**
 * Who this browser is: a random player id and the name it plays under, kept in localStorage. There
 * are no accounts; the id marks the player's seat online and their saved games.
 */

const PLAYER_KEY = 'volley.playerId';
const NAME_KEY = 'volley.name';

/**
 * This browser's player id, made on first use. It's the key to the player's seat and history, so
 * it's kept in localStorage; if that's blocked, it lasts as long as the page.
 */
export function playerId(): string {
	try {
		const saved = localStorage.getItem(PLAYER_KEY);
		if (saved) return saved;
		const id = crypto.randomUUID();
		localStorage.setItem(PLAYER_KEY, id);
		return id;
	} catch {
		return crypto.randomUUID();
	}
}

/** The name this browser last played under, or '' if it's never had one. */
export function savedName(): string {
	try {
		return cleanName(localStorage.getItem(NAME_KEY) ?? '');
	} catch {
		return '';
	}
}

export function saveName(name: string) {
	try {
		localStorage.setItem(NAME_KEY, name);
	} catch {
		// Blocked storage: the name lasts as long as the page.
	}
}
