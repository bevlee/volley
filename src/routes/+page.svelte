<script lang="ts">
	import { withDefence, withShot } from '#lib/engine/choosers.ts';
	import { newGame, playGame, step } from '#lib/engine/rally.ts';
	import type { Channel, Game, Shot, Stance, TeamId } from '#lib/engine/types.ts';
	import Controls from '#lib/ui/Controls.svelte';
	import PlayPanel from '#lib/ui/PlayPanel.svelte';
	import { needsDefence, needsShot, nextAction } from '#lib/ui/story.ts';
	import Court from '#lib/ui/Court.svelte';
	import { ROLL_MS } from '#lib/ui/Die.svelte';
	import {
		ballAt,
		placeDice,
		positions,
		rollBall,
		rollPositions,
		type PlacedDie,
		type Point,
		type Positions
	} from '#lib/ui/layout.ts';
	import RallyLog from '#lib/ui/RallyLog.svelte';
	import Scoreboard from '#lib/ui/Scoreboard.svelte';

	const randomSeed = () => Math.floor(Math.random() * 1_000_000);
	/** Time for a player to run to where they roll (matches the chip tween). */
	const MOVE_MS = 400;
	/** Pause after the dice land before the step's result is shown. */
	const RESOLVE_MS = ROLL_MS + 150;

	const initialSeed = randomSeed();
	const initialGame = newGame(initialSeed);
	let seed = $state(initialSeed);
	/** The true game state. */
	let game = $state.raw(initialGame);
	/** What the court, score and log show. Lags `game` while a step plays out. */
	let shown = $state.raw(initialGame);
	/** Overrides where the court draws players and the ball while someone runs to their spot to roll. */
	let staged = $state.raw<{ pos: Positions; ball: Point } | null>(null);
	/** The team whose attacking shots the player chooses; null to just watch. */
	let controlled = $state<TeamId | null>('A');
	/** The shot the player is hovering, previewed on the court. */
	let preview = $state<Shot | null>(null);
	const choosing = $derived(needsShot(shown, controlled) && shown === game);
	/** The defence the player is setting up; kept between rallies as their default. */
	let defence = $state<{ block: Channel; stance: Stance }>({ block: 'line', stance: 'deep' });
	const defending = $derived(needsDefence(shown, controlled) && shown === game);
	let dice = $state.raw<{ key: number; items: PlacedDie[] }>({ key: 0, items: [] });
	let timers: ReturnType<typeof setTimeout>[] = [];

	const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

	/**
	 * Show a new state in beats, in volleyball order:
	 * 1. move: anyone who must get to a spot before rolling runs there (a setter to the setting spot);
	 * 2. roll: the step's dice tumble where the rollers stand;
	 * 3. resolve: once the dice settle, players move on, the ball moves and the log updates.
	 * Multi-step jumps (Play rally, Play game, Reset) go straight to the end.
	 */
	function show(next: Game, animate: boolean) {
		timers.forEach(clearTimeout);
		timers = [];
		shown = game; // finish any step still playing out
		staged = null;
		game = next;
		const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (!animate || !next.rolls.length || reduced) {
			dice = { key: next.steps, items: placeDice(next.rolls, animate ? rollPositions(shown, next.rolls) : positions(next)) };
			shown = next;
			return;
		}
		const rollAt = rollPositions(shown, next.rolls);
		const ballDuringRoll = rollBall(shown, next.rolls, rollAt);
		const mustMove =
			!same(rollAt, positions(shown)) || !same(ballDuringRoll, ballAt(shown, positions(shown)));
		const roll = () => {
			dice = { key: next.steps, items: placeDice(next.rolls, rollAt) };
			timers.push(
				setTimeout(() => {
					staged = null;
					shown = next;
				}, RESOLVE_MS)
			);
		};
		if (mustMove) {
			staged = { pos: rollAt, ball: ballDuringRoll };
			dice = { key: next.steps, items: [] };
			timers.push(setTimeout(roll, MOVE_MS));
		} else roll();
	}

	const stepOnce = () => {
		if (needsDefence(game, controlled)) return setDefence();
		// On the player's attack, the step waits for them to choose a shot.
		if (game.phase.kind !== 'gameOver' && !needsShot(game, controlled)) show(step(game), true);
	};

	function setDefence() {
		if (!needsDefence(game, controlled)) return;
		show(step(game, withDefence(defence.block, defence.stance)), true);
	}

	const DEFENCE_KEYS: Record<string, () => void> = {
		'1': () => (defence.block = 'line'),
		'2': () => (defence.block = 'cross'),
		'3': () => (defence.stance = 'deep'),
		'4': () => (defence.stance = 'short')
	};

	function choose(shot: Shot) {
		if (!needsShot(game, controlled)) return;
		preview = null;
		show(step(game, withShot(shot)), true);
	}

	/** Play to the end of the rally, stopping early if it's the player's call. */
	function playRallyOrUntilChoice() {
		let g = game;
		do {
			if (needsShot(g, controlled) || needsDefence(g, controlled)) break;
			g = step(g);
		} while (g.phase.kind !== 'pointOver' && g.phase.kind !== 'gameOver');
		show(g, false);
	}

	const SHOT_KEYS: Record<string, Shot> = { '1': 'line', l: 'line', '2': 'cross', c: 'cross', '3': 'tip', t: 'tip' };

	/** Space or → steps, unless you're typing in the seed box or a button already has focus. */
	function onkeydown(e: KeyboardEvent) {
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
		const shot = SHOT_KEYS[e.key.toLowerCase()];
		if (shot && choosing) {
			e.preventDefault();
			return choose(shot);
		}
		if (defending && DEFENCE_KEYS[e.key]) {
			e.preventDefault();
			return DEFENCE_KEYS[e.key]();
		}
		if (defending && e.key === 'Enter') {
			e.preventDefault();
			return setDefence();
		}
		if (e.key !== ' ' && e.key !== 'ArrowRight') return;
		if (e.target instanceof HTMLButtonElement) return;
		e.preventDefault();
		stepOnce();
	}

	const reset = () => show(newGame(Number(seed) || 0), false);
	const newSeed = () => {
		seed = randomSeed();
		reset();
	};
</script>

<svelte:window {onkeydown} />

<svelte:head>
	<title>Volley</title>
</svelte:head>

<main>
	<h1>Volley · beach 2v2</h1>
	<!-- Score and controls stay pinned while you scroll down to the court. -->
	<header>
		<Scoreboard game={shown} />
		<Controls
		bind:seed
		bind:controlled
		{choosing}
		{defending}
		bind:defence
		ondefend={setDefence}
		onshot={choose}
		onpreview={(s) => (preview = s)}
		over={shown.phase.kind === 'gameOver'}
		next={nextAction(shown, controlled)}
		onstep={stepOnce}
		onrally={playRallyOrUntilChoice}
		ongame={() => show(playGame(game), false)}
		onreset={reset}
		onnewseed={newSeed}
		/>
	</header>
	<div class="layout">
		<div>
			<PlayPanel game={shown} {choosing} {defending} />
			<Court game={shown} {dice} {staged} preview={choosing ? preview : null}
				defencePreview={defending ? defence : null}
			/>
		</div>
		<RallyLog game={shown} />
	</div>
</main>

<style>
	main {
		max-width: 960px;
		margin: 0 auto;
		padding: 16px;
	}
	h1 {
		font-size: 1rem;
		font-weight: 600;
		margin: 0;
		color: var(--muted);
	}
	header {
		position: sticky;
		top: 0;
		z-index: 2;
		background: var(--bg);
		padding: 4px 0 8px;
	}
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
		gap: 24px;
		align-items: start;
	}
	@media (max-width: 720px) {
		.layout {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
