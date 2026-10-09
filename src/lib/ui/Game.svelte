<script lang="ts">
	import { withDefence, withShot, type Choosers } from '#lib/engine/choosers.ts';
	import { newGame, playGame, step } from '#lib/engine/rally.ts';
	import type { Game, TeamId } from '#lib/engine/types.ts';
	import DebugDrawer from './DebugDrawer.svelte';
	import GameScreen from './GameScreen.svelte';
	import { callsSoFar, type CallMakers } from './record.ts';
	import { saveVsComputer, type SaveState } from './saveGame.ts';
	import SavedLine from './SavedLine.svelte';
	import { needsDefence, needsShot, playsItself } from './story.ts';

	/** A game against the computer: the engine runs here, in the browser. */

	/** On /admin: the debug panel (D) for the seed, who you control, and playing ahead. */
	let { admin = false }: { admin?: boolean } = $props();

	const randomSeed = () => Math.floor(Math.random() * 1_000_000);

	const firstSeed = randomSeed();
	let seed = $state(firstSeed);
	const initial = newGame(firstSeed);
	let screen: GameScreen;
	let shown = $state.raw<Game>(initial);
	/** The team whose calls the player makes; null to just watch. */
	let controlled = $state<TeamId | null>('A');
	let debugOpen = $state(false);
	/** The calls the player made in this game, for its record; the computer made the rest. */
	let makers: CallMakers = new Map();
	/** The finished game's save; null until it's over (and for games the player only watched). */
	let save = $state.raw<SaveState | null>(null);
	/** Bumped for every new game, so a slow save can't land on the next one. */
	let gameNo = 0;

	/** Once play reaches the end of the game, saves it, if the player made any of its calls. */
	async function saveIfOver(g: Game) {
		if (g.phase.kind !== 'gameOver' || save || !controlled || !makers.size) return;
		const no = gameNo;
		save = { kind: 'saving' };
		const result = await saveVsComputer(g, makers, controlled);
		if (no === gameNo) save = result;
	}

	/** The player makes their part of the call: the rest is still the computer's. */
	function playerCall(part: 'shot' | 'defence', choosers: Choosers) {
		makers.set(callsSoFar(screen.latest()), { shot: part !== 'shot', defence: part !== 'defence' });
		play(choosers);
	}

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

	function play(choosers?: Choosers) {
		const chain = chainFrom(screen.latest(), choosers);
		screen.playChain(chain);
		saveIfOver(chain.at(-1)!);
	}

	function jumpTo(g: Game) {
		screen.jumpTo(g);
		saveIfOver(g);
	}

	/** Play to the end of the rally, stopping early if it's the player's call. */
	function playRallyOrUntilChoice() {
		let g = screen.latest();
		do {
			if (needsShot(g, controlled) || needsDefence(g, controlled)) break;
			g = step(g);
		} while (g.phase.kind !== 'pointOver' && g.phase.kind !== 'gameOver');
		jumpTo(g);
	}

	function reset() {
		makers = new Map();
		save = null;
		gameNo++;
		screen.jumpTo(newGame(Number(seed) || 0));
	}
	const newSeed = () => {
		seed = randomSeed();
		reset();
	};
</script>

<svelte:head>
	<title>{admin ? 'Volley admin' : 'Volley · vs computer'}</title>
</svelte:head>

<!-- Space at the call when watching (no team controlled) reveals both computer calls and rolls the attack. -->
<GameScreen
	bind:this={screen}
	bind:shown
	{initial}
	{controlled}
	onadvance={() => play()}
	onshot={(shot) => playerCall('shot', withShot(shot))}
	ondefence={(d) => playerCall('defence', withDefence(d.block, d.stance))}
	onover={newSeed}
	{debugOpen}
	ondebug={admin ? () => (debugOpen = !debugOpen) : null}
>
	{#snippet dock()}
		{#if shown.phase.kind === 'gameOver'}<SavedLine {save} />{/if}
	{/snippet}
</GameScreen>
{#if admin}
	<DebugDrawer
		bind:open={debugOpen}
		game={shown}
		bind:seed
		bind:controlled
		onrally={playRallyOrUntilChoice}
		ongame={() => jumpTo(playGame(screen.latest()))}
		onreset={reset}
		onnewseed={newSeed}
	/>
{/if}
