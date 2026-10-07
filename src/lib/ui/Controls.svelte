<script lang="ts">
	import type { Channel, Shot, Stance, TeamId } from '#lib/engine/types.ts';

	let {
		seed = $bindable(),
		controlled = $bindable(),
		choosing,
		defending,
		defence = $bindable(),
		ondefend,
		onshot,
		onpreview,
		over,
		next,
		onstep,
		onrally,
		ongame,
		onreset,
		onnewseed
	}: {
		seed: number;
		/** The team the player calls shots for, or null to watch. */
		controlled: TeamId | null;
		/** It's the player's attack: show the shot buttons instead of Step. */
		choosing: boolean;
		/** It's the other team's attack: show the block and defender choices. */
		defending: boolean;
		defence: { block: Channel; stance: Stance };
		ondefend: () => void;
		onshot: (shot: Shot) => void;
		/** Hovering or focusing a shot previews it on the court; null when it stops. */
		onpreview: (shot: Shot | null) => void;
		over: boolean;
		/** What the next step does, e.g. "Attack!". */
		next: string;
		onstep: () => void;
		onrally: () => void;
		ongame: () => void;
		onreset: () => void;
		onnewseed: () => void;
	} = $props();

	function run(e: MouseEvent, action: () => void) {
		(e.currentTarget as HTMLElement).blur();
		action();
	}

	const SHOTS: { shot: Shot; label: string; key: string }[] = [
		{ shot: 'line', label: 'Line', key: '1' },
		{ shot: 'cross', label: 'Cross', key: '2' },
		{ shot: 'tip', label: 'Tip', key: '3' }
	];
	const BLOCKS: { value: Channel; label: string; key: string }[] = [
		{ value: 'line', label: 'Line', key: '1' },
		{ value: 'cross', label: 'Cross', key: '2' }
	];
	const STANCES: { value: Stance; label: string; key: string }[] = [
		{ value: 'deep', label: 'Deep', key: '3' },
		{ value: 'short', label: 'Short', key: '4' }
	];
</script>

<!-- Buttons drop focus after a click, so Space keeps meaning "next step" rather than re-pressing them. -->
<div class="controls">
	{#if over}
		<button class="primary" onclick={(e) => run(e, onnewseed)}>New game</button>
	{:else if choosing}
		<span class="prompt">Your shot:</span>
		{#each SHOTS as s (s.shot)}
			<button
				class="primary shot"
				onclick={(e) => run(e, () => onshot(s.shot))}
				onmouseenter={() => onpreview(s.shot)}
				onmouseleave={() => onpreview(null)}
				onfocus={() => onpreview(s.shot)}
				onblur={() => onpreview(null)}
			>
				{s.label} <kbd>{s.key}</kbd>
			</button>
		{/each}
	{:else if defending}
		<span class="prompt">Your defence:</span>
		<span class="group" role="group" aria-label="Block">
			<span class="group-label">Block</span>
			{#each BLOCKS as b (b.value)}
				<button class:on={defence.block === b.value} aria-pressed={defence.block === b.value} onclick={(e) => run(e, () => (defence.block = b.value))}>
					{b.label} <kbd>{b.key}</kbd>
				</button>
			{/each}
		</span>
		<span class="group" role="group" aria-label="Defender">
			<span class="group-label">Defender</span>
			{#each STANCES as d (d.value)}
				<button class:on={defence.stance === d.value} aria-pressed={defence.stance === d.value} onclick={(e) => run(e, () => (defence.stance = d.value))}>
					{d.label} <kbd>{d.key}</kbd>
				</button>
			{/each}
		</span>
		<button class="primary" onclick={(e) => run(e, ondefend)}>Lock it in <kbd>Space</kbd></button>
	{:else}
		<button class="primary" onclick={(e) => run(e, onstep)} title="Space or → also steps">
			{next} <kbd>Space</kbd>
		</button>
		<button onclick={(e) => run(e, onrally)}>Play rally</button>
		<button onclick={(e) => run(e, ongame)}>Play game</button>
	{/if}
	<details class="options">
		<summary>Options</summary>
		<div class="option-row">
			<button onclick={(e) => run(e, onreset)}>Replay this game</button>
			<button onclick={(e) => run(e, onnewseed)}>New seed</button>
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
	</details>
</div>

<style>
	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
		margin-bottom: 0;
	}
	.primary {
		background: var(--text);
		color: var(--bg);
		border-color: var(--text);
		font-weight: 700;
		min-width: 9.5rem;
	}
	.group {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.group-label {
		font-size: 0.8rem;
		color: var(--muted);
	}
	.on {
		background: var(--block);
		border-color: var(--block);
		color: var(--bg);
		font-weight: 700;
	}
	.prompt {
		font-weight: 700;
	}
	.primary.shot {
		min-width: 5.5rem;
	}
	kbd {
		font-size: 0.65rem;
		opacity: 0.7;
		border: 1px solid currentColor;
		border-radius: 3px;
		padding: 0 3px;
		margin-left: 4px;
	}
	.options summary {
		cursor: pointer;
		color: var(--muted);
		font-size: 0.85rem;
	}
	.option-row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 6px;
	}
	label {
		display: flex;
		gap: 6px;
		align-items: center;
		color: var(--muted);
	}
	input {
		width: 7rem;
	}
</style>
