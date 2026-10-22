<script lang="ts">
	import { motion, pace, setMotion, setPace, type Motion, type Pace } from './pace.svelte.ts';

	/** How the court plays out on this screen: its speed, and whether it animates. Remembered in this browser. */

	const SPEEDS: { value: Pace; label: string }[] = [
		{ value: 'quick', label: 'Quick' },
		{ value: 'normal', label: 'Normal' },
		{ value: 'slow', label: 'Slow' }
	];
	const MOTIONS: { value: Motion; label: string }[] = [
		{ value: 'on', label: 'On' },
		{ value: 'reduced', label: 'Reduced' }
	];

	let dialog: HTMLDialogElement;

	export const isOpen = () => dialog.open;

	export function toggle() {
		if (dialog.open) dialog.close();
		else dialog.showModal();
	}
</script>

<!-- Clicking the backdrop (the dialog element itself, outside the card) closes it. -->
<dialog bind:this={dialog} onclick={(e) => e.target === dialog && dialog.close()} aria-label="Settings">
	<div class="card">
		<div class="head">
			<h2>Settings</h2>
			<button onclick={() => dialog.close()} aria-label="Close settings">×</button>
		</div>

		<div class="row" role="radiogroup" aria-label="Speed">
			<span class="label">Speed</span>
			{#each SPEEDS as s (s.value)}
				<button role="radio" aria-checked={pace.value === s.value} class:on={pace.value === s.value} onclick={() => setPace(s.value)}>
					{s.label}
				</button>
			{/each}
		</div>
		<p class="note">
			How fast the court plays out on this screen. Online, your opponent keeps their own speed, and your clock starts once
			your screen has caught up.
		</p>

		<div class="row" role="radiogroup" aria-label="Motion">
			<span class="label">Motion</span>
			{#each MOTIONS as m (m.value)}
				<button role="radio" aria-checked={motion.value === m.value} class:on={motion.value === m.value} onclick={() => setMotion(m.value)}>
					{m.label}
				</button>
			{/each}
		</div>
		<p class="note">
			Reduced skips the ball's flights, the players' runs and the court's shakes.
		</p>
	</div>
</dialog>

<style>
	dialog {
		border: none;
		padding: 0;
		background: transparent;
		width: min(420px, calc(100vw - 32px));
		max-height: calc(100dvh - 48px);
	}
	dialog::backdrop {
		background: rgb(0 0 0 / 0.45);
	}
	.card {
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 16px 20px 18px;
		font-size: 0.92rem;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.head button {
		font-size: 1.2rem;
		line-height: 1;
		padding: 2px 10px;
	}
	h2 {
		font-size: 1.1rem;
		margin: 0;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		margin-top: 16px;
	}
	.label {
		color: var(--muted);
		min-width: 4em;
	}
	.row button {
		font: inherit;
		padding: 3px 12px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: transparent;
		color: var(--text);
		cursor: pointer;
	}
	.row button.on {
		background: var(--text);
		border-color: var(--text);
		color: var(--surface);
	}
	.note {
		color: var(--muted);
		font-size: 0.85rem;
		margin: 6px 0 0;
	}
</style>
