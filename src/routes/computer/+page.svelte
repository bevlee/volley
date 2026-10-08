<script lang="ts">
	import { withDefence, withShot, type Choosers } from '#lib/engine/choosers.ts';
	import { newGame, playGame, step } from '#lib/engine/rally.ts';
	import type { Game, TeamId } from '#lib/engine/types.ts';
	import DebugDrawer from '#lib/ui/DebugDrawer.svelte';
	import GameScreen from '#lib/ui/GameScreen.svelte';
	import { needsDefence, needsShot, playsItself } from '#lib/ui/story.ts';

	/** A game against the computer: the engine runs here, in the browser. */

	const randomSeed = () => Math.floor(Math.random() * 1_000_000);

	const firstSeed = randomSeed();
	let seed = $state(firstSeed);
	const initial = newGame(firstSeed);
	let screen: GameScreen;
	let shown = $state.raw<Game>(initial);
	/** The team whose calls the player makes; null to just watch. */
	let controlled = $state<TeamId | null>('A');
	let debugOpen = $state(false);

	/**
	 * Steps once with `choosers`, then (after the calls) the attack, then everything that plays on its
	 * own (the serve, pass and set), up to the next call or the end of the point.
	 */
	function chainFrom(game: Game, choosers?: Choosers): Game[] {
		const chain = [step(game, choosers)];
		let g = chain[0];
		if (g.phase.kind === 'hit') chain.push((g = step(g)));
		while (playsItself(g)) chain.push((g = step(g)));
		return chain;
	}

	const play = (choosers?: Choosers) => screen.playChain(chainFrom(screen.latest(), choosers));

	/** Play to the end of the rally, stopping early if it's the player's call. */
	function playRallyOrUntilChoice() {
		let g = screen.latest();
		do {
			if (needsShot(g, controlled) || needsDefence(g, controlled)) break;
			g = step(g);
		} while (g.phase.kind !== 'pointOver' && g.phase.kind !== 'gameOver');
		screen.jumpTo(g);
	}

	const reset = () => screen.jumpTo(newGame(Number(seed) || 0));
	const newSeed = () => {
		seed = randomSeed();
		reset();
	};
</script>

<svelte:head>
	<title>Volley · vs computer</title>
</svelte:head>

<!-- Space at the call when watching (no team controlled) reveals both computer calls and rolls the attack. -->
<GameScreen
	bind:this={screen}
	bind:shown
	{initial}
	{controlled}
	onadvance={() => play()}
	onshot={(shot) => play(withShot(shot))}
	ondefence={(d) => play(withDefence(d.block, d.stance))}
	onover={newSeed}
	{debugOpen}
	ondebug={() => (debugOpen = !debugOpen)}
/>
<DebugDrawer
	bind:open={debugOpen}
	game={shown}
	bind:seed
	bind:controlled
	onrally={playRallyOrUntilChoice}
	ongame={() => screen.jumpTo(playGame(screen.latest()))}
	onreset={reset}
	onnewseed={newSeed}
/>
