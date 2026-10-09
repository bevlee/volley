<script lang="ts">
	import { config } from '#lib/engine/config.ts';
	import { pace, setPace, type Pace } from './pace.svelte.ts';

	const SPEEDS: { value: Pace; label: string }[] = [
		{ value: 'quick', label: 'Quick' },
		{ value: 'normal', label: 'Normal' },
		{ value: 'slow', label: 'Slow' }
	];

	let dialog: HTMLDialogElement;

	export const isOpen = () => dialog.open;

	export function toggle() {
		if (dialog.open) dialog.close();
		else dialog.showModal();
	}
</script>

<!-- Clicking the backdrop (the dialog element itself, outside the card) closes it. -->
<dialog bind:this={dialog} onclick={(e) => e.target === dialog && dialog.close()} aria-label="Rules">
	<div class="card">
		<div class="head">
			<h2>How to play</h2>
			<button onclick={() => dialog.close()} aria-label="Close rules">×</button>
		</div>
		<div class="speed" role="radiogroup" aria-label="Animation speed">
			<span class="speed-label">Speed</span>
			{#each SPEEDS as s (s.value)}
				<button role="radio" aria-checked={pace.value === s.value} class:on={pace.value === s.value} onclick={() => setPace(s.value)}>
					{s.label}
				</button>
			{/each}
		</div>
		<p class="speed-note">How fast the court plays out on this screen. Online, your opponent keeps their own speed, and your clock starts once your screen has caught up.</p>
		<p>
			2v2 beach volleyball to {config.targetScore}, win by {config.winBy}. Every touch is a dice roll, and a
			good pass or set makes the next touch better. Your team is at the bottom of the court: against the
			computer that's <span class="a">A</span> (blue), and online it's whichever side you're on.
		</p>

		<h3>The rally</h3>
		<p>
			Serve, pass, set, attack. Then the other side blocks and digs, and if they dig it up, they attack
			back. A block touch counts as one of the three contacts, so there's no pass: the defender sets it
			straight away and the blocker attacks. With no pass bonus, that set and the aim take
			{String(config.touchFirstMod).replace('-', '−')} instead.
		</p>

		<h3>Quality</h3>
		<p>
			Every pass, dig, set and hit is graded <b>Perfect</b>, <b>Good</b>, <b>Shaky</b> or <b>Poor</b>. A
			better pass or dig makes the set better, and a better set makes the hit harder and more accurate.
			Two natural 1s in a row (pass then set, or set then hit) is an error and loses the point. Tap a
			score under the court to see the numbers.
		</p>

		<h3>Aim</h3>
		<p>Every attack also rolls to aim. Better passes and sets aim better.</p>
		<table>
			<tbody>
				<tr><td>On target</td><td>Lands where you called it</td></tr>
				<tr><td>A bit off</td><td>Drifts toward the defender: a zone over, or straight to them if they read the shot</td></tr>
				<tr><td>Badly off</td><td>A hard shot goes straight into the block, even if the blocker guarded the other side. A tip just drifts.</td></tr>
				<tr><td>Way off</td><td>An easy ball over to the other side</td></tr>
			</tbody>
		</table>

		<h3>Your attack: pick a shot</h3>
		<ul>
			<li><b>Line</b>: hard, straight down the sideline.</li>
			<li><b>Cross</b>: hard, angled across the court.</li>
			<li><b>Tip</b>: soft, over the block into the short middle.</li>
		</ul>

		<h3>Your defence: block and dig</h3>
		<ul>
			<li><b>Block</b> line or cross: the blocker takes that hard shot away, and may stuff it straight back.</li>
			<li><b>Deep</b>: the defender covers the hard shot the blocker leaves open.</li>
			<li><b>Short</b>: the defender creeps in for the tip, leaving the open hard shot unguarded.</li>
		</ul>

		<h3>Covered vs open</h3>
		<p>
			Any defence covers two of the three shots and leaves one open. The court shades them:
			<span class="bad">red</span> where the blocker or defender is covering, <span class="ok">green</span>
			where it's open. Attack the open zone and it's hard to stop. Attack a covered one and you need
			better dice. A defender who reads the attack (already covering the called shot) gets +{config.readBonus} on the dig.
		</p>

		<h3>On the court</h3>
		<ul>
			<li>Dashed arrow: the shot that was called. Solid arrow: where it went.</li>
			<li>Dice appear where they're rolled, then fade once the result is shown.</li>
			<li>
				Under the court: how the attack was built (the pass, dig or block touch, then the set), then the
				attack, block and dig scores. Tap a score to see how it adds up.
			</li>
		</ul>

		<h3>Keys</h3>
		<p>
			<kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> pick a shot · <kbd>1</kbd>–<kbd>4</kbd> pick a defence · <kbd>Space</kbd> roll
			the attack, or serve the next rally · <kbd>?</kbd> rules. The serve, pass and set play
			on their own; Space skips ahead.
		</p>
	</div>
</dialog>

<style>
	dialog {
		border: none;
		padding: 0;
		background: transparent;
		max-width: min(520px, calc(100vw - 32px));
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
		padding: 16px 20px;
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
	.speed {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 12px;
	}
	.speed-label {
		color: var(--muted);
		margin-right: 4px;
	}
	.speed button {
		font: inherit;
		padding: 3px 12px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: transparent;
		color: var(--text);
		cursor: pointer;
	}
	.speed button.on {
		background: var(--text);
		border-color: var(--text);
		color: var(--surface);
	}
	.speed-note {
		color: var(--muted);
		font-size: 0.85rem;
		margin: 6px 0 14px;
		padding-bottom: 12px;
		border-bottom: 1px solid var(--border);
	}
	h3 {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--muted);
		margin: 14px 0 4px;
	}
	p,
	ul {
		margin: 0;
	}
	table {
		margin-top: 4px;
		border-collapse: collapse;
		font-size: 0.85rem;
	}
	td {
		padding: 2px 10px 2px 0;
		vertical-align: top;
	}
	td:first-child {
		font-weight: 700;
		white-space: nowrap;
	}
	ul {
		padding-left: 18px;
	}
	.a {
		color: var(--team-a);
		font-weight: 700;
	}
	.ok {
		color: var(--open);
		font-weight: 700;
	}
	.bad {
		color: var(--covered);
		font-weight: 700;
	}
	kbd {
		font-size: 0.75rem;
		border: 1px solid var(--border);
		border-radius: 3px;
		padding: 0 4px;
	}
</style>
