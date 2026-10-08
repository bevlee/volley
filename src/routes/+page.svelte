<script lang="ts">
	import { withDefence, withShot } from '#lib/engine/choosers.ts';
	import { newGame, playGame, step } from '#lib/engine/rally.ts';
	import type { Channel, Game, Shot, Stance, TeamId } from '#lib/engine/types.ts';
	import Controls from '#lib/ui/Controls.svelte';
	import DebugDrawer from '#lib/ui/DebugDrawer.svelte';
	import Rules from '#lib/ui/Rules.svelte';
	import ScoreLine from '#lib/ui/ScoreLine.svelte';
	import ScorePanel from '#lib/ui/ScorePanel.svelte';
	import { scoreSheet, type ScoreSheet } from '#lib/ui/scores.ts';
	import { needsDefence, needsShot, nextAction, playsItself, statusLine, stepEntries } from '#lib/ui/story.ts';
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
	import TopBar from '#lib/ui/TopBar.svelte';

	const randomSeed = () => Math.floor(Math.random() * 1_000_000);
	/** Time for a player to run to where they roll (matches the chip tween). */
	const MOVE_MS = 400;
	/** Pause after the dice land before the step's result is shown. */
	const RESOLVE_MS = ROLL_MS + 150;
	/** Pauses between steps that play on their own: after the calls are revealed, after the attack, otherwise. */
	const AFTER_CALLS_MS = 900;
	const AFTER_ATTACK_MS = 1300;
	const BETWEEN_MS = 250;

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
	/** The shot the player has picked for their attack; Space hits it. Kept between attacks as their default. */
	let shotPick = $state<Shot>('line');
	const choosing = $derived(needsShot(shown, controlled) && shown === game);
	/** The defence the player is setting up; kept between rallies as their default. */
	let defence = $state<{ block: Channel; stance: Stance }>({ block: 'line', stance: 'deep' });
	const defending = $derived(needsDefence(shown, controlled) && shown === game);
	let debugOpen = $state(false);
	/** The latest attack's numbers. They stay up after the rally ends, until the next ball is set or a new game. */
	let sheet = $state.raw<ScoreSheet | null>(null);
	$effect(() => {
		const next = scoreSheet(shown);
		if (next || shown.steps === 0) sheet = next;
	});
	let rules: Rules;
	let scoreLine: ScoreLine;
	/** Dice on the court. A possession's pass and set dice stay (faded) until the attack, so you can see the build-up. */
	let dice = $state.raw<{ key: number; items: (PlacedDie & { step: number })[] }>({ key: 0, items: [] });
	let timers: ReturnType<typeof setTimeout>[] = [];
	/** Steps still to play on their own after the one on screen. */
	let pending: Game[] = [];

	const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

	/**
	 * Show a new state in beats, in volleyball order:
	 * 1. move: anyone who must get to a spot before rolling runs there (a setter to the setting spot);
	 * 2. roll: the step's dice tumble where the rollers stand;
	 * 3. resolve: once the dice settle, players move on, the ball moves and the log updates.
	 * Multi-step jumps (Play rally, Play game, Reset) go straight to the end.
	 */
	function show(next: Game, animate: boolean, onDone?: () => void) {
		timers.forEach(clearTimeout);
		timers = [];
		shown = game; // finish any step still playing out
		staged = null;
		game = next;
		const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
		// A new rally or an attack clears the court's dice; a pass or set adds to them.
		const fresh =
			!animate || next.steps < dice.key || stepEntries(next).some((e) => ['rallyStart', 'serve', 'hit', 'swing'].includes(e.tag ?? ''));
		const place = (at: Positions) => [
			...(fresh ? [] : dice.items),
			...placeDice(next.rolls, at).map((d) => ({ ...d, step: next.steps }))
		];
		const finish = () => {
			staged = null;
			shown = next;
			onDone?.();
		};
		if (!animate || !next.rolls.length || reduced) {
			dice = { key: next.steps, items: place(animate ? rollPositions(shown, next.rolls) : positions(next)) };
			return finish();
		}
		const rollAt = rollPositions(shown, next.rolls);
		const ballDuringRoll = rollBall(shown, next.rolls, rollAt);
		const mustMove =
			!same(rollAt, positions(shown)) || !same(ballDuringRoll, ballAt(shown, positions(shown)));
		const roll = () => {
			dice = { key: next.steps, items: place(rollAt) };
			timers.push(setTimeout(finish, RESOLVE_MS));
		};
		if (mustMove) {
			staged = { pos: rollAt, ball: ballDuringRoll };
			dice = { key: next.steps, items: fresh ? [] : dice.items };
			timers.push(setTimeout(roll, MOVE_MS));
		} else roll();
	}

	/**
	 * Play `first`, then carry on through the steps that play on their own (the serve, pass and set),
	 * one beat at a time, until the next call or the end of the point. With `attack`, `first` is the
	 * calls and the attack is rolled straight after them.
	 */
	function play(first: Game, attack = false) {
		const chain = [first];
		let g = first;
		if (attack && g.phase.kind === 'hit') chain.push((g = step(g)));
		while (playsItself(g)) chain.push((g = step(g)));
		pending = chain.slice(1);
		const next = () => {
			const after = game.phase.kind === 'hit' ? AFTER_CALLS_MS : stepEntries(game).some((e) => e.tag === 'hit') ? AFTER_ATTACK_MS : BETWEEN_MS;
			const following = pending.shift();
			if (following) timers.push(setTimeout(() => show(following, true, next), after));
		};
		show(first, true, next);
	}

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
		if (pending.length || shown !== game) return skip();
		if (game.phase.kind === 'gameOver') return;
		if (needsDefence(game, controlled)) return setDefence();
		if (needsShot(game, controlled)) return attack();
		// Watching: Space at the call reveals both sides' calls and rolls the attack.
		play(step(game), game.phase.kind === 'calls');
	};

	function setDefence() {
		if (!needsDefence(game, controlled)) return;
		play(step(game, withDefence(defence.block, defence.stance)), true);
	}

	function attack() {
		if (!needsShot(game, controlled)) return;
		preview = null;
		play(step(game, withShot(shotPick)), true);
	}

	const DEFENCE_KEYS: Record<string, () => void> = {
		'1': () => (defence.block = 'line'),
		'2': () => (defence.block = 'cross'),
		'3': () => (defence.stance = 'deep'),
		'4': () => (defence.stance = 'short')
	};

	/** Picking a shot only selects it; Space (or the Attack button) hits it. */
	const choose = (shot: Shot) => (shotPick = shot);

	/** Play to the end of the rally, stopping early if it's the player's call. */
	function playRallyOrUntilChoice() {
		pending = [];
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
		// The phone's score sheet and the rules are modal: no game keys behind them (they close themselves on Escape).
		if (scoreLine.isOpen()) return;
		if (e.key === '?' || (e.key === '/' && e.shiftKey)) return rules.toggle();
		if (rules.isOpen()) return;
		if (e.key === 'd' || e.key === 'D') return (debugOpen = !debugOpen);
		if (e.key === 'Escape' && debugOpen) return (debugOpen = false);
		const shot = SHOT_KEYS[e.key.toLowerCase()];
		if (shot && choosing) {
			e.preventDefault();
			return choose(shot);
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

	const reset = () => {
		pending = [];
		show(newGame(Number(seed) || 0), false);
	};
	const newSeed = () => {
		seed = randomSeed();
		reset();
	};
</script>

<svelte:window {onkeydown} />

<svelte:head>
	<title>Volley</title>
</svelte:head>

<!-- --chrome-h is roughly the top bar plus the dock (and the scoreline when narrow), so the court fills the rest of the screen. -->
<main>
	<TopBar game={shown} {debugOpen} onhelp={() => rules.toggle()} ondebug={() => (debugOpen = !debugOpen)} />
	<div class="play">
		<div class="side"><ScorePanel {sheet} /></div>
		<div class="centre">
			<Court
				game={shown}
				{dice}
				{staged}
				preview={choosing ? (preview ?? shotPick) : null}
				defencePreview={defending ? defence : null}
				onshot={choosing ? choose : null}
				onpreview={(s) => (preview = s)}
			/>
			<ScoreLine {sheet} bind:this={scoreLine} />
			<Controls
				status={statusLine(shown, controlled)}
				{choosing}
				{defending}
				bind:defence
				ondefend={setDefence}
				shot={shotPick}
				onshot={choose}
				onattack={attack}
				onpreview={(s) => (preview = s)}
				over={shown.phase.kind === 'gameOver'}
				next={nextAction(shown, controlled)}
				onstep={stepOnce}
				onnewgame={newSeed}
			/>
		</div>
	</div>
</main>
<DebugDrawer
	bind:open={debugOpen}
	game={shown}
	bind:seed
	bind:controlled
	onrally={playRallyOrUntilChoice}
	ongame={() => {
		pending = [];
		show(playGame(game), false);
	}}
	onreset={reset}
	onnewseed={newSeed}
/>
<Rules bind:this={rules} />

<style>
	main {
		max-width: 880px;
		margin: 0 auto;
		padding: 0 16px 8px;
		--chrome-h: 230px;
	}
	/* Scores on the left of the court (the debug drawer slides in on the right). */
	.play {
		display: grid;
		grid-template-columns: 260px minmax(0, 560px);
		justify-content: center;
		gap: 16px;
		align-items: start;
	}
	.side {
		padding-top: 8px;
	}
	/* Narrower, the court takes the full width and a one-row scoreline under it stands in for the panel. */
	@media (max-width: 860px) {
		main {
			--chrome-h: 290px;
		}
		.play {
			grid-template-columns: minmax(0, 1fr);
		}
		.side {
			display: none;
		}
	}
	/* The top bar fits in one row on a phone. With the browser's bars showing, a phone can be short:
	   let the court shrink further rather than push the controls off the screen. */
	@media (max-width: 600px) {
		main {
			--chrome-h: 276px;
			--court-min: 200px;
		}
	}
</style>
