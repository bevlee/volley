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

const MOTION_KEY = 'volley:motion';

/** Whether the game animates: as the device asks (its reduce-motion setting), always, or reduced. */
export type Motion = 'device' | 'on' | 'reduced';

/**
 * The viewer's animation setting, remembered in this browser. It lets someone keep reduce-motion on
 * for their phone but still see the court play out here, or reduce motion in the game only.
 */
export const motion = $state({ value: loadMotion() });

function loadMotion(): Motion {
	try {
		const saved = localStorage.getItem(MOTION_KEY);
		if (saved === 'device' || saved === 'on' || saved === 'reduced') return saved;
	} catch {
		// Storage can be blocked; follow the device.
	}
	return 'device';
}

const deviceReduces = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The game plays with reduced motion: chosen here, or asked for by the device while following it. */
export const reducedMotion = () => motion.value === 'reduced' || (motion.value === 'device' && deviceReduces());

/** CSS animations check `[data-motion='reduced']` on the page instead of the device's media query. */
function applyMotion() {
	if (typeof document !== 'undefined') document.documentElement.dataset.motion = reducedMotion() ? 'reduced' : 'full';
}
applyMotion();
if (typeof matchMedia !== 'undefined') matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', applyMotion);

export function setMotion(next: Motion) {
	motion.value = next;
	applyMotion();
	try {
		localStorage.setItem(MOTION_KEY, next);
	} catch {
		// Private windows can refuse storage; the setting still applies for this visit.
	}
}
