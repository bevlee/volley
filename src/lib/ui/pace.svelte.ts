const KEY = 'volley:pace';

export type Pace = 'quick' | 'normal' | 'slow';

/** How much longer than normal each pace takes the court's animations. */
export const PACES: Record<Pace, number> = { quick: 0.6, normal: 1, slow: 1.5 };

/**
 * How fast the court plays out, chosen by each viewer and remembered in this browser. Online it
 * only changes this screen: the server waits for each screen to catch up before starting its clock.
 */
export const pace = $state({ value: loadPace() });

function loadPace(): Pace {
	try {
		const saved = localStorage.getItem(KEY);
		if (saved && saved in PACES) return saved as Pace;
	} catch {
		// Storage can be blocked; keep the default.
	}
	return 'normal';
}

/** A normal-speed duration at the chosen pace. */
export const paced = (ms: number) => ms * PACES[pace.value];

/** CSS animations on the court scale with `--pace`. */
function applyPace() {
	if (typeof document !== 'undefined') document.documentElement.style.setProperty('--pace', String(PACES[pace.value]));
}
applyPace();

export function setPace(next: Pace) {
	pace.value = next;
	applyPace();
	try {
		localStorage.setItem(KEY, next);
	} catch {
		// Private windows can refuse storage; the pace still applies for this visit.
	}
}
