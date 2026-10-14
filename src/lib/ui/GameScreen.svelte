<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { config } from '#lib/engine/config.ts';
	import { other } from '#lib/engine/rally.ts';
	import { attackOptionsIn, blockModesFor, SHOTS } from '#lib/engine/rules.ts';
	import type { AttackOption, BlockMode, Channel, DefenceSpecial, Game, Shot, Stance, TeamId, Tempo } from '#lib/engine/types.ts';
	import BuildUp from './BuildUp.svelte';
	import Controls from './Controls.svelte';
	import Court from './Court.svelte';
	import Rules from './Rules.svelte';
	import Settings from './Settings.svelte';
	import ScoreLine from './ScoreLine.svelte';
	import TopBar from './TopBar.svelte';
	import { choreograph, fullTrails, holdAfter, sample, still, type Frame, type Timeline } from './choreo.ts';
	import { placeDice, positions, previewDefence, type PlacedDie, type Positions } from './layout.ts';
	import { clearsSheet, scoreSheet, type ScoreSheet } from './scores.ts';
	import { commentary, needsDefence, needsShot, nextAction, prompt, quietLine, statusLine, stepEntries } from './story.ts';
	import { pace, paced, PACES, reducedMotion } from './pace.svelte.ts';

	/**
	 * The court and everything around it, for one game. It doesn't step the engine: whoever runs the
	 * game (Game.svelte against the computer, or the server online) hands it chains of states to play
	 * with `playChain`, and hears about the player's moves through `onadvance`, `onshot` and `ondefence`.
	 */
	let {
		initial,
		controlled,
		you = null,
		bottom = 'A',
		names = null,
		opponent = null,
		shown = $bindable(),
		idle = $bindable(true),
		locked = false,
		status = null,
		stepLabel = null,
		stepDisabled = false,
		overLabel = 'New game',
		overDisabled = false,
		onadvance,
		onshot,
		ondefence,
		onover,
		onsettled,
		debugOpen = false,
		ondebug = null,
		onleave,
		banner,
		dock
	}: {
		initial: Game;
		/** The team the player calls for; null to just watch. */
		controlled: TeamId | null;
		/** Online, the player's team, marked "you" in the score. */
		you?: TeamId | null;
		/** The team drawn in the bottom half: the viewer's own side (A unless they played B). */
		bottom?: TeamId;
		/** Online, each team's player's name, for the score. */
		names?: Record<TeamId, string | null> | null;
		/** Online, whether the other player is connected. */
		opponent?: 'connected' | 'away' | 'waiting' | null;
		/** What the court is showing: lags the latest state while a chain plays out. */
		shown?: Game;
		/** Nothing is playing out: the court shows the latest state. */
		idle?: boolean;
		/** Online: the player's part of the call is in, so the call controls are put away. */
		locked?: boolean;
		/** Replaces the status line (online: who's being waited on). */
		status?: string | null;
		stepLabel?: string | null;
		stepDisabled?: boolean;
		overLabel?: string;
		overDisabled?: boolean;
		/** Space or the step button when there's no call to make: serve, play on, next rally. */
		onadvance: () => void;
		/** `tempo` when set tempos are in play; `special` when the hitter spends a charge (the ?specials prototype). */
		onshot: (shot: Shot, extra?: { tempo?: Tempo; special?: boolean }) => void;
		/** `blockMode` when block modes are in play; `spend` when the blocker or digger spends a charge (the ?specials prototype). */
		ondefence: (defence: { block: Channel; stance: Stance; blockMode?: BlockMode; spend?: DefenceSpecial }) => void;
		/** The game-over button. */
		onover: () => void;
		/** The court has played out everything up to `game`, the latest state (online: start my clock). */
		onsettled?: (game: Game) => void;
		debugOpen?: boolean;
		/** Shows the debug button and the D key (/admin only); null hides them. */
		ondebug?: (() => void) | null;
		/** Online: a Leave button in the top bar. */
		onleave?: () => void;
		/** Under the top bar. */
		banner?: Snippet;
		/** Between the court and the controls. */
		dock?: Snippet;
	} = $props();

	/**
	 * How the play is described under the court, while we compare (?commentary=…): `line` is one line
	 * for the latest moment, `off` only says whose call it is and how the point ended, `feed` keeps
	 * the whole rally's commentary on screen.
	 */
	type Commentary = 'line' | 'off' | 'feed';
	const mode: Commentary = ((m) => (m === 'off' || m === 'feed' ? m : 'line'))(
		new URLSearchParams(location.search).get('commentary')
	);

	/** The latest state: what play has reached. `initial` only sets where it starts. */
	const start = untrack(() => initial);
	let game = $state.raw(start);
	/** What the court draws (the calls, the arrows, who's attacking): it switches when a step's dice have settled. */
	let court = $state.raw(start);
	/** What's been told (the score, the commentary, the controls): a result switches it when the ball lands. */
	shown = start;
	const view = $derived(shown ?? start);
	/** The shot the player is hovering, previewed on the court. */
	let preview = $state<Shot | null>(null);
	/** The shot the player has picked for their attack; Space hits it. Kept between attacks as their default. */
	let shotPick = $state<AttackOption>({ shot: 'line' });
	/** The defence the player is setting up; kept between rallies as their default. */
	let defence = $state<{ block: Channel; stance: Stance; blockMode: BlockMode }>({ block: 'line', stance: 'deep', blockMode: 'commit' });
	/** The ?specials prototype: whether the player's attack spends a charge, and where their defence spends one. Reset after each call. */
	let special = $state(false);
	let spend = $state<DefenceSpecial>('none');
	/** Who could spend a charge on this attack, and how many they have; null when charges are off. */
	const charges = $derived.by(() => {
		const a = view.attack;
		if (!view.pips || !a) return null;
		const mine = view.teams[a.team];
		const theirs = view.teams[other(a.team)];
		const pips = view.pips;
		return {
			hitter: mine[a.hitter].name,
			hitterPips: pips[a.team][a.hitter],
			blocker: theirs.blocker.name,
			blockerPips: pips[other(a.team)].blocker,
			digger: theirs.defender.name,
			diggerPips: pips[other(a.team)].defender
		};
	});
	const choosing = $derived(needsShot(view, controlled) && view === game && !locked);
	/**
	 * The attacks the player can pick from: the hitter's options when tempos or run rules are in play
	 * (their abilities, the set), or the three shots of a normal game.
	 */
	const choices = $derived.by((): (AttackOption & { label: string })[] => {
		const a = view.attack;
		const t = a && view.teams[a.team];
		const detailed = a && a.setMod !== undefined && (config.blockModes || t?.runKit || t?.playbook);
		const options: AttackOption[] = detailed ? attackOptionsIn(view) : SHOTS.map((shot) => ({ shot }));
		return options.map((o) => ({ ...o, label: attackLabel(o) }));
	});
	function attackLabel({ shot, tempo }: AttackOption): string {
		if (shot === 'over') return 'Dig over';
		if (shot === 'tip') return 'Tip';
		const name = shot === 'line' ? 'line' : 'cross';
		return tempo === 'fast' ? `Quick ${name}` : tempo === 'high' ? `High ${name}` : name[0].toUpperCase() + name.slice(1);
	}
	const samePick = (x: AttackOption, y: AttackOption) => x.shot === y.shot && x.tempo === y.tempo;
	// A pick from an earlier attack that this hitter can't make falls back to their first option.
	$effect(() => {
		if (choosing && choices.length && !choices.some((c) => samePick(c, shotPick))) shotPick = { shot: choices[0].shot, tempo: choices[0].tempo };
	});
	/** How the player's blocker can play it, when block modes are in play; null otherwise. */
	const modes = $derived.by((): BlockMode[] | null => {
		const a = view.attack;
		return config.blockModes && a ? blockModesFor(view.teams[other(a.team)].blocker) : null;
	});
	$effect(() => {
		if (modes && !modes.includes(defence.blockMode)) defence.blockMode = 'commit';
	});
	const defending = $derived(needsDefence(view, controlled) && view === game && !locked);
	/** The latest attack's numbers. They stay up after the attack, until a new possession or rally starts (see clearsSheet). */
	let sheet = $state.raw<ScoreSheet | null>(null);
	$effect(() => {
		const next = scoreSheet(view);
		if (next || view.steps === 0 || clearsSheet(view)) sheet = next;
	});
	let rules: Rules;
	let settings: Settings;
	let scoreLine: ScoreLine;
	/** Dice on the court. A possession's pass and set dice stay (faded) until the attack, so you can see the build-up. */
	let dice = $state.raw<{ key: number; items: (PlacedDie & { step: number })[] }>({ key: 0, items: [] });
	/** The possession's earlier flights, kept on the court as its build-up. */
	let trails = $state.raw<string[]>([]);
	/** The step playing out (see choreo.ts), and how far into it, in ms at normal pace. */
	let playing: { tl: Timeline; next: Game; t: number; last: number; rolled: boolean; onDone?: (tl: Timeline) => void } | null = null;
	/** The court at this moment while a step plays; null when it's at rest. */
	let live = $state.raw<Frame | null>(null);
	let frameId = 0;
	let hold: ReturnType<typeof setTimeout> | undefined;
	/** Steps still to play on their own after the one on screen. */
	let pending = $state.raw<Game[]>([]);
	/**
	 * Play is running on its own (a step animating, or the serve, pass or set still to come): the
	 * main button waits, showing where play is heading, until it's the player's turn again.
	 */
	const busy = $derived(live !== null || pending.length > 0);
	const heading = $derived(pending.at(-1) ?? game);
	$effect(() => {
		idle = !busy;
		// Reads `game` too, so a jump to a new state while idle counts as settling on it.
		const latest = game;
		if (!busy) untrack(() => onsettled?.(latest));
	});
	$effect(() => () => {
		cancelAnimationFrame(frameId);
		clearTimeout(hold);
	});
	// Nobody watches a hidden tab: catch up at once rather than playing on when they come back.
	$effect(() => {
		const hidden = () => document.hidden && busy && skip();
		document.addEventListener('visibilitychange', hidden);
		return () => document.removeEventListener('visibilitychange', hidden);
	});

	/** Where the players stand at rest: the defending pair on the spots the player is choosing. */
	const restPositions = $derived(defending ? previewDefence(court, defence.block, defence.stance) : positions(court));
	const frame = $derived(live ?? still(court, restPositions, bottom));

	/** The banner's and dock's heights, measured, so the court shrinks to keep the controls on screen. */
	let bannerH = $state(0);
	let dockH = $state(0);

	/**
	 * Plays the step to `next` on the court, laid out by `choreograph`: runners, then the dice, then
	 * the new state with the ball's flight, and the result told when it lands. Jumps (a snapshot, a
	 * skip, the debug panel's Play rally) go straight to the end.
	 */
	function show(next: Game, animate: boolean, onDone?: (tl: Timeline) => void) {
		finish();
		clearTimeout(hold);
		const prev = game;
		game = next;
		if (!animate) {
			trails = [];
			dice = { key: next.steps, items: place(next, positions(next), true) };
			court = shown = next;
			return;
		}
		const tl = choreograph(prev, next, { bottom, start: restPositions });
		if (tl.fresh) {
			trails = [];
			dice = { key: dice.key, items: [] };
		}
		playing = { tl, next, t: 0, last: performance.now(), rolled: false, onDone };
		if (reducedMotion()) return finish();
		advance(0);
		frameId = requestAnimationFrame(tick);
	}

	/** This step's dice, added to the possession's (or on their own, for a step that starts a new picture). */
	const place = (next: Game, at: Positions, fresh: boolean) => [
		...(fresh ? [] : dice.items),
		...placeDice(next.rolls, at, bottom).map((d) => ({ ...d, step: next.steps }))
	];

	function tick(now: number) {
		const p = playing;
		if (!p) return;
		const ms = Math.max(0, now - p.last) / PACES[pace.value];
		p.last = now;
		advance(ms);
		if (playing) frameId = requestAnimationFrame(tick);
	}

	/** Moves the playing step on by `ms`: the dice, the reveal and the landing happen as their times pass. */
	function advance(ms: number) {
		const p = playing!;
		p.t = Math.min(p.tl.duration, p.t + ms);
		const { tl, next, t } = p;
		if (tl.roll && t >= tl.roll.at && !p.rolled) {
			p.rolled = true;
			dice = { key: next.steps, items: place(next, tl.roll.pos, false) };
		}
		if (t >= tl.revealAt && court !== next) court = next;
		if (t >= tl.tellAt && shown !== next) shown = next;
		if (t < tl.duration) {
			live = sample(tl, t);
			return;
		}
		trails = [...trails, ...fullTrails(tl)];
		live = null;
		playing = null;
		p.onDone?.(tl);
	}

	/** Plays whatever step is playing to its end at once. */
	function finish() {
		cancelAnimationFrame(frameId);
		if (playing) advance(Infinity);
	}

	/** After a step `tl` has played out: pause, then play the next one still to come. */
	function playNext(tl: Timeline) {
		// A step leaves the queue only when it starts, so play counts as busy through the pause before it.
		const [following, ...rest] = pending;
		if (!following) return;
		hold = setTimeout(() => {
			pending = rest;
			show(following, true, playNext);
		}, paced(holdAfter(tl, game)));
	}

	/**
	 * Plays a chain of states one beat at a time. If one is still playing (online, the other player
	 * can be quick), the new chain plays after it.
	 */
	export function playChain(chain: Game[]) {
		if (!chain.length) return;
		if (busy) {
			pending = [...pending, ...chain];
			return;
		}
		pending = chain.slice(1);
		show(chain[0], true, playNext);
	}

	/** Shows a state straight away, dropping anything still to play. */
	export function jumpTo(next: Game) {
		pending = [];
		show(next, false);
	}

	/** The latest state, which may be ahead of what's on screen. */
	export const latest = () => game;

	/**
	 * Space while anything is still playing jumps to where play next waits. It never commits a call:
	 * pressing during the last step's animation must not lock in a defence the player hasn't chosen.
	 */
	function skip() {
		const last = pending.at(-1) ?? game;
		pending = [];
		show(last, false);
	}

	const stepOnce = () => {
		if (busy) return skip();
		if (game.phase.kind === 'gameOver') return;
		if (defending) return setDefence();
		if (choosing) return attack();
		if (!stepDisabled) onadvance();
	};

	function setDefence() {
		if (!defending) return;
		const has = { none: true, block: !!charges?.blockerPips, dig: !!charges?.diggerPips };
		ondefence({
			block: defence.block,
			stance: defence.stance,
			...(modes && { blockMode: defence.blockMode }),
			...(charges && { spend: has[spend] ? spend : 'none' })
		});
		spend = 'none';
	}

	function attack() {
		if (!choosing) return;
		preview = null;
		onshot(shotPick.shot, { tempo: shotPick.tempo, special: special && !!charges?.hitterPips });
		special = false;
	}

	const DEFENCE_KEYS: Record<string, () => void> = {
		'1': () => (defence.block = 'line'),
		'2': () => (defence.block = 'cross'),
		'3': () => (defence.stance = 'deep'),
		'4': () => (defence.stance = 'short'),
		'7': () => modes?.includes('commit') && (defence.blockMode = 'commit'),
		'8': () => modes?.includes('read') && (defence.blockMode = 'read'),
		'9': () => modes?.includes('none') && (defence.blockMode = 'none')
	};

	/** Picking an attack only selects it; Space (or the Attack button) hits it. */
	const choose = (o: AttackOption) => (shotPick = { shot: o.shot, tempo: o.tempo });
	/** Clicking a zone on the court picks the first attack at it. */
	const chooseShot = (shot: Shot) => {
		const o = choices.find((c) => c.shot === shot);
		if (o) choose(o);
	};

	const SHOT_KEYS: Record<string, Shot> = { l: 'line', c: 'cross', t: 'tip' };

	/** Space or → steps, unless you're typing in a box or a button already has focus. */
	function onkeydown(e: KeyboardEvent) {
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
		// The phone's score sheet, help and settings are modal: no game keys behind them (they close themselves on Escape).
		if (scoreLine.isOpen() || settings.isOpen()) return;
		if (e.key === '?' || (e.key === '/' && e.shiftKey)) return rules.toggle();
		if (rules.isOpen()) return;
		if (ondebug && (e.key === 'd' || e.key === 'D')) return ondebug();
		if (ondebug && e.key === 'Escape' && debugOpen) return ondebug();
		if (charges && choosing && e.key.toLowerCase() === 's' && charges.hitterPips) {
			e.preventDefault();
			special = !special;
			return;
		}
		if (charges && defending && (e.key === '5' || e.key === '6')) {
			e.preventDefault();
			const on: DefenceSpecial = e.key === '5' ? 'block' : 'dig';
			if (on === 'block' ? charges.blockerPips : charges.diggerPips) spend = spend === on ? 'none' : on;
			return;
		}
		// Number keys pick the attacks in order; L, C and T pick by shot.
		const numbered = choices[Number(e.key) - 1];
		if (choosing && /^[1-9]$/.test(e.key) && numbered) {
			e.preventDefault();
			return choose(numbered);
		}
		const shot = SHOT_KEYS[e.key.toLowerCase()];
		if (shot && choosing) {
			e.preventDefault();
			return chooseShot(shot);
		}
		if (defending && DEFENCE_KEYS[e.key]) {
			e.preventDefault();
			return DEFENCE_KEYS[e.key]();
		}
		if ((defending || choosing) && e.key === 'Enter') {
			e.preventDefault();
			return defending ? setDefence() : attack();
		}
		if (e.key !== ' ' && e.key !== 'ArrowRight') return;
		if (e.target instanceof HTMLButtonElement) return;
		e.preventDefault();
		stepOnce();
	}
</script>

<svelte:window {onkeydown} />

<!-- One column at every size: the court, the controls, then how the attack was built and its scores.
     --chrome-h is roughly everything but the court, so the court fills the rest of the screen; online,
     the measured banner and clocks are added to it. -->
<main
	class:feed={mode === 'feed'}
	style:--extra-h="{bannerH + dockH}px"
	style:--court-min={bannerH + dockH ? '200px' : undefined}
>
	<TopBar game={view} {you} {names} {opponent} {debugOpen} onhelp={() => rules.toggle()} onsettings={() => settings.toggle()} {ondebug} {onleave} />
	{#if banner}<div bind:clientHeight={bannerH}>{@render banner()}</div>{/if}
	<Court
		game={court}
		{frame}
		{trails}
		landed={court === view}
		glide={!live}
		{dice}
		{bottom}
		preview={choosing ? (preview ?? shotPick.shot) : null}
		defencePreview={defending ? defence : null}
		onshot={choosing ? chooseShot : null}
		onpreview={(s) => (preview = s)}
	/>
	{#if dock}<div bind:clientHeight={dockH}>{@render dock()}</div>{/if}
	<Controls
		status={status ??
			(mode === 'line' ? statusLine(view, controlled) : mode === 'off' ? quietLine(view, controlled) : (prompt(view, controlled) ?? ''))}
		feed={mode === 'feed' ? commentary(view) : null}
		{choosing}
		{defending}
		{charges}
		bind:special
		bind:spend
		bind:defence
		ondefend={setDefence}
		{choices}
		{modes}
		pick={shotPick}
		onpick={choose}
		onattack={attack}
		onpreview={(s) => (preview = s)}
		over={view.phase.kind === 'gameOver'}
		next={stepLabel ?? nextAction(busy ? heading : view, controlled)}
		{busy}
		{stepDisabled}
		onstep={stepOnce}
		{overLabel}
		{overDisabled}
		onnewgame={onover}
	/>
	<BuildUp game={view} />
	<ScoreLine {sheet} bind:this={scoreLine} />
</main>
<Rules bind:this={rules} />
<Settings bind:this={settings} />

<style>
	main {
		max-width: 600px;
		margin: 0 auto;
		padding: 0 16px 8px;
		--chrome-h: calc(346px + var(--extra-h));
	}
	/* The top bar fits in one row on a phone. With the browser's bars showing, a phone can be short:
	   let the court shrink further rather than push the controls off the screen. */
	@media (max-width: 600px) {
		main {
			--chrome-h: calc(332px + var(--extra-h));
			--court-min: 200px;
		}
	}
	/* The narrowest phones: a little less margin, so the top bar fits. */
	@media (max-width: 340px) {
		main {
			padding: 0 10px 8px;
		}
	}
	/* The commentary feed is a few lines taller than the one-line status. */
	main.feed {
		--chrome-h: calc(420px + var(--extra-h));
	}
	@media (max-width: 600px) {
		main.feed {
			--chrome-h: calc(406px + var(--extra-h));
		}
	}
</style>
