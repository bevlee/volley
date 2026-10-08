<script lang="ts">
	import type { Channel, Shot, Stance } from '#lib/engine/types.ts';

	let {
		status,
		choosing,
		defending,
		defence = $bindable(),
		ondefend,
		shot,
		onshot,
		onattack,
		onpreview,
		over,
		next,
		onstep,
		onnewgame
	}: {
		/** One line on whose call it is or what just happened. */
		status: string;
		/** It's the player's attack: show the shot buttons instead of Step. */
		choosing: boolean;
		/** It's the other team's attack: show the block and dig choices. */
		defending: boolean;
		defence: { block: Channel; stance: Stance };
		ondefend: () => void;
		/** The shot picked for the player's attack. */
		shot: Shot;
		/** Picks a shot; it doesn't hit it. */
		onshot: (shot: Shot) => void;
		/** Hits the picked shot: the calls are revealed, then the attack rolls. */
		onattack: () => void;
		/** Hovering or focusing a shot previews it on the court; null when it stops. */
		onpreview: (shot: Shot | null) => void;
		over: boolean;
		/** What the next step does, e.g. "Attack!". */
		next: string;
		onstep: () => void;
		onnewgame: () => void;
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
<section class="dock">
	<p class="status" aria-live="polite">{status}</p>
	<div class="row">
		{#if over}
			<button class="primary" onclick={(e) => run(e, onnewgame)}>New game</button>
		{:else if choosing}
			<span class="group" role="group" aria-label="Shot">
				{#each SHOTS as s (s.shot)}
					<button
						class:on={shot === s.shot}
						aria-pressed={shot === s.shot}
						onclick={(e) => run(e, () => onshot(s.shot))}
						onmouseenter={() => onpreview(s.shot)}
						onmouseleave={() => onpreview(null)}
						onfocus={() => onpreview(s.shot)}
						onblur={() => onpreview(null)}
					>
						{s.label} <kbd>{s.key}</kbd>
					</button>
				{/each}
			</span>
			<button class="primary" onclick={(e) => run(e, onattack)}>Attack! <kbd>Space</kbd></button>
		{:else if defending}
			<span class="group" role="group" aria-label="Block">
				<span class="group-label">Block</span>
				{#each BLOCKS as b (b.value)}
					<button class:on={defence.block === b.value} aria-pressed={defence.block === b.value} onclick={(e) => run(e, () => (defence.block = b.value))}>
						{b.label} <kbd>{b.key}</kbd>
					</button>
				{/each}
			</span>
			<span class="group" role="group" aria-label="Dig">
				<span class="group-label">Dig</span>
				{#each STANCES as d (d.value)}
					<button class:on={defence.stance === d.value} aria-pressed={defence.stance === d.value} onclick={(e) => run(e, () => (defence.stance = d.value))}>
						{d.label} <kbd>{d.key}</kbd>
					</button>
				{/each}
			</span>
			<button class="primary" onclick={(e) => run(e, ondefend)}>Lock in <kbd>Space</kbd></button>
		{:else}
			<button class="primary wide" onclick={(e) => run(e, onstep)} title="Space or → also steps">
				{next} <kbd>Space</kbd>
			</button>
		{/if}
	</div>
	{#if choosing}
		<p class="hint">Pick a shot, then Space to hit it. A hard shot gets stuffed if they block it. A tip gets dug if their defender creeps short.</p>
	{:else if defending}
		<p class="hint"><span class="bad">Red</span> is covered, <span class="ok">green</span> is open.</p>
	{/if}
</section>

<style>
	.dock {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 8px 0 4px;
		/* Tall enough for the defence choices and hint, so the court never changes size. */
		min-height: 120px;
		box-sizing: border-box;
	}
	p {
		margin: 0;
		text-align: center;
	}
	.status {
		font-weight: 600;
		min-height: 1.5em;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 8px;
		align-items: center;
	}
	.hint {
		font-size: 0.8rem;
		color: var(--muted);
		max-width: 34rem;
	}
	.ok {
		color: var(--open);
		font-weight: 700;
	}
	.bad {
		color: var(--covered);
		font-weight: 700;
	}
	.primary {
		background: var(--text);
		color: var(--bg);
		border-color: var(--text);
		font-weight: 700;
		min-width: 5.5rem;
	}
	.primary.wide {
		min-width: 12rem;
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
	kbd {
		font-size: 0.65rem;
		opacity: 0.7;
		border: 1px solid currentColor;
		border-radius: 3px;
		padding: 0 3px;
		margin-left: 4px;
	}
	/* No keyboard on a touch screen, so no key hints. */
	@media (hover: none) {
		kbd {
			display: none;
		}
	}
</style>
