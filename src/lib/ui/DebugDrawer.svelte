<script lang="ts">
	import type { Game, TeamId } from '#lib/engine/types.ts';
	import PlayPanel from './PlayPanel.svelte';
	import RallyLog from './RallyLog.svelte';

	let {
		open = $bindable(),
		game,
		seed = $bindable(),
		controlled = $bindable(),
		onrally,
		ongame,
		onreset,
		onnewseed
	}: {
		open: boolean;
		game: Game;
		seed: number;
		/** The team the player calls shots for, or null to watch. */
		controlled: TeamId | null;
		onrally: () => void;
		ongame: () => void;
		onreset: () => void;
		onnewseed: () => void;
	} = $props();

	function run(e: MouseEvent, action: () => void) {
		(e.currentTarget as HTMLElement).blur();
		action();
	}
</script>

<!-- Slides over the right of the screen; inert while closed so Tab never lands in it. -->
<aside class="drawer" class:open inert={!open} aria-label="Debug panel">
	<div class="head">
		<span>Debug</span>
		<button class="close" onclick={() => (open = false)} aria-label="Close debug panel">×</button>
	</div>
	<div class="row">
		<button onclick={(e) => run(e, onrally)}>Play rally</button>
		<button onclick={(e) => run(e, ongame)}>Play game</button>
		<button onclick={(e) => run(e, onreset)}>Replay game</button>
		<button onclick={(e) => run(e, onnewseed)}>New seed</button>
	</div>
	<div class="row">
		<label>Seed <input type="number" bind:value={seed} onchange={onreset} /></label>
		<label>
			You play
			<select bind:value={controlled}>
				<option value="A">Team A</option>
				<option value="B">Team B</option>
				<option value={null}>Watch only</option>
			</select>
		</label>
	</div>
	<h2>This step</h2>
	<PlayPanel {game} />
	<h2>Log</h2>
	<RallyLog {game} />
</aside>

<style>
	.drawer {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		z-index: 10;
		width: min(380px, 92vw);
		box-sizing: border-box;
		padding: 12px 16px;
		overflow-y: auto;
		background: var(--surface);
		border-left: 1px solid var(--border);
		box-shadow: -8px 0 24px rgb(0 0 0 / 0.12);
		transform: translateX(105%);
		transition: transform 220ms ease-out;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.drawer.open {
		transform: none;
	}
	@media (prefers-reduced-motion: reduce) {
		.drawer {
			transition: none;
		}
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-weight: 700;
	}
	.close {
		font-size: 1.2rem;
		line-height: 1;
		padding: 2px 10px;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	h2 {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--muted);
		margin: 8px 0 0;
	}
	label {
		display: flex;
		gap: 6px;
		align-items: center;
		color: var(--muted);
		font-size: 0.9rem;
	}
	input {
		width: 6.5rem;
	}
</style>
