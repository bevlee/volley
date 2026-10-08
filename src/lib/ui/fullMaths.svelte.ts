const KEY = 'volley:full-maths';

/**
 * "See details" adds what every number means, and the aim's outcome table, to a score's breakdown. Off by default;
 * shared by the score panel and the phone's score sheet, and remembered between visits.
 */
export const maths = $state({ full: false });

/** Read the saved choice in the browser, so the server-rendered page and the first paint agree. */
export function loadFullMaths() {
	try {
		maths.full = localStorage.getItem(KEY) === '1';
	} catch {
		// Storage can be blocked; keep the default.
	}
}

export function saveFullMaths() {
	try {
		localStorage.setItem(KEY, maths.full ? '1' : '0');
	} catch {
		// Private windows can refuse storage; the toggle still works for this visit.
	}
}
