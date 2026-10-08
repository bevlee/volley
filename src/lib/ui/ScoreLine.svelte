<script lang="ts">
	import { other } from '#lib/engine/rally.ts';
	import type { TeamId } from '#lib/engine/types.ts';
	import Breakdown, { type ScoreKind } from './Breakdown.svelte';
	import { loadFullMaths, maths, saveFullMaths } from './fullMaths.svelte.ts';
	import { setLine, type Score, type ScoreSheet } from './scores';

	/**
	 * The latest attack's scores: one row under the court, in the order the ball meets them (attack,
	 * then block, then dig). Tapping or clicking a score opens a sheet with how it adds up.
	 */
	let { sheet }: { sheet: ScoreSheet | null } = $props();

	$effect(loadFullMaths);

	let dialog: HTMLDialogElement;
	let tab = $state<ScoreKind>('attack');
	export const isOpen = () => dialog?.open ?? false;

	/** A kill is named on the attack, in the attacking team's colour. */
	const isKill = (verdict: string) => verdict === 'Kill' || verdict === 'Tip kill';

	const TITLE: Record<ScoreKind, string> = { attack: 'Attack', aim: 'Aim', block: 'Block', dig: 'Dig' };
	const AIM_RESULT: Record<string, string> = {
		exact: 'On target',
		drift: 'Drifted',
		block: 'Into the block',
		easy: 'Mis-hit'
	};

	interface Slot {
		kind: ScoreKind;
		team: TeamId;
		who: string;
		total: string;
		verdict: string;
		/** There's something to show in the sheet: a score, or why there wasn't one. */
		open: boolean;
	}

	/** "?" means not rolled yet; "–" means there's a result but no sum (no block, or a perfect hit or error). */
	const slot = (kind: ScoreKind, team: TeamId, s: Score | null, rolled: boolean): Slot =>
		s
			? { kind, team, who: s.who, total: `${s.total ?? (s.verdict ? '–' : '?')}`, verdict: s.verdict ?? '', open: true }
			: { kind, team, who: '', total: rolled ? '–' : '?', verdict: '', open: false };

	/** Before any ball is set: the three scores still to come, so the row keeps its shape. */
	const BLANK: Slot[] = (['attack', 'block', 'dig'] as const).map((kind) => slot(kind, 'A', null, false));

	const slots = $derived.by((): Slot[] => {
		if (!sheet) return BLANK;
		const rolled = sheet.attack.total !== null || Boolean(sheet.attack.verdict);
		const defending = other(sheet.attack.team);
		const block = slot('block', defending, sheet.block, rolled);
		if (!sheet.block && sheet.blockNote) Object.assign(block, { verdict: 'No block', open: true });
		return [slot('attack', sheet.attack.team, sheet.attack, rolled), block, slot('dig', defending, sheet.dig, rolled)];
	});
	/** The sheet's tabs: the open scores, with the aim after the attack once the ball is hit. */
	const tabs = $derived.by((): Slot[] => {
		const open = slots.filter((s) => s.open);
		if (!sheet?.aim) return open;
		const aim: Slot = {
			kind: 'aim',
			team: sheet.attack.team,
			who: sheet.attack.who,
			total: `${sheet.aim.total}`,
			verdict: AIM_RESULT[sheet.aim.result],
			open: true
		};
		return [open[0], aim, ...open.slice(1)];
	});
	const current = $derived(tabs.find((s) => s.kind === tab) ?? tabs[0]);

	function show(kind: ScoreKind) {
		tab = kind;
		dialog.showModal();
	}

	// A new rally clears the scores; don't leave an empty sheet up.
	$effect(() => {
		if (!sheet && dialog?.open) dialog.close();
	});
</script>

{#snippet head(title: string, s: Pick<Slot, 'team' | 'who' | 'verdict' | 'total'>)}
	<div class="head {s.team}">
		<span class="title">{title}</span>
		<span class="who">{s.who}</span>
		{#if s.verdict}<span class="verdict" class:kill={isKill(s.verdict)}>{s.verdict}</span>{/if}
		<span class="total">{s.total}</span>
	</div>
{/snippet}

<nav class="line" aria-label="Attack and defence scores">
	{#each slots as s, i (s.kind)}
		{#if i > 0}
			<svg class="chevron" viewBox="0 0 8 16" width="8" height="16" aria-hidden="true"><path d="M1 2l6 6l-6 6" /></svg>
		{/if}
		<button
			type="button"
			class="slot {s.team}"
			disabled={!s.open}
			onclick={() => show(s.kind)}
			aria-label="{TITLE[s.kind]}{s.who ? ` ${s.who}` : ''}: {s.total}{s.verdict ? `, ${s.verdict}` : ''}. Show how it adds up"
		>
			<span class="total">{s.total}</span>
			<span class="text">
				<span class="title">{TITLE[s.kind]} <span class="who">{s.who}</span></span>
				<span class="verdict" class:kill={isKill(s.verdict)}>{s.verdict}</span>
			</span>
		</button>
	{/each}
</nav>

<!-- Clicking the backdrop (the dialog element itself, outside the sheet) closes it. -->
<!-- Closing hands focus back to the score that opened it; drop it, or Space would reopen the sheet
     instead of playing on. -->
<dialog
	bind:this={dialog}
	onclick={(e) => e.target === dialog && dialog.close()}
	onclose={() => (document.activeElement as HTMLElement | null)?.blur()}
	aria-label="How the scores add up"
>
	<div class="sheet">
		<div class="bar">
			<div class="tabs" role="tablist" aria-label="Score">
				{#each tabs as s (s.kind)}
					<button type="button" role="tab" class={s.team} aria-selected={current?.kind === s.kind} onclick={() => (tab = s.kind)}>
						{TITLE[s.kind]} <b>{s.total}</b>
					</button>
				{/each}
			</div>
			<button type="button" class="close" onclick={() => dialog.close()} aria-label="Close">×</button>
		</div>

		{#if sheet && current}
			<div class="body" role="tabpanel">
				{#if current.kind === 'attack'}
					{@render head('Attack score', current)}
					<p class="setup"><b>{sheet.setup.join(' → ')}</b><br /><span>{setLine(sheet)}</span></p>
					{#if sheet.note}<p class="note touch">{sheet.note}</p>{/if}
					<div class="maths"><Breakdown kind="attack" score={sheet.attack} {sheet} /></div>
				{:else if current.kind === 'aim'}
					{@render head('Aim', current)}
					<p class="note">Where the ball goes. It doesn’t change the attack score.</p>
					<div class="maths"><Breakdown kind="aim" {sheet} /></div>
				{:else if current.kind === 'block'}
					{#if sheet.block}
						{@render head('Block score', current)}
						<div class="maths"><Breakdown kind="block" score={sheet.block} {sheet} /></div>
					{:else}
						<p class="note">{sheet.blockNote}</p>
					{/if}
				{:else if sheet.dig}
					{@render head('Dig score', current)}
					<div class="maths"><Breakdown kind="dig" score={sheet.dig} {sheet} /></div>
				{/if}
			</div>
		{/if}

		<label class="full"><input type="checkbox" bind:checked={maths.full} onchange={saveFullMaths} /> See details</label>
	</div>
</dialog>

<style>
	.A {
		--team: var(--team-a);
	}
	.B {
		--team: var(--team-b);
	}
	.line {
		display: flex;
		align-items: stretch;
		min-height: 52px;
		margin-top: 8px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		overflow: hidden;
	}
	.slot {
		flex: 1 1 0;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 8px;
		border: 0;
		border-radius: 0;
		box-shadow: inset 0 3px 0 var(--team);
		background: none;
		text-align: left;
		cursor: pointer;
	}
	.slot:disabled {
		opacity: 1;
		cursor: default;
		box-shadow: inset 0 3px 0 var(--border);
		color: var(--muted);
	}
	.slot:disabled .total {
		color: var(--muted);
	}
	.slot:focus-visible {
		outline: 2px solid var(--block);
		outline-offset: -2px;
	}
	.slot .total {
		font-size: 1.35rem;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
		line-height: 1;
		color: var(--team);
	}
	.text {
		display: flex;
		flex-direction: column;
		min-width: 0;
		line-height: 1.2;
	}
	.slot .title {
		font-size: 0.66rem;
		font-weight: 800;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--team);
		white-space: nowrap;
	}
	.slot:disabled .title {
		color: var(--muted);
	}
	.who {
		font-weight: 500;
		letter-spacing: 0;
		color: var(--muted);
	}
	.slot .verdict {
		font-size: 0.78rem;
		font-weight: 700;
	}
	.verdict.kill {
		color: var(--team);
	}
	.chevron {
		align-self: center;
		flex: 0 0 auto;
		fill: none;
		stroke: var(--muted);
		stroke-width: 1.5;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	/* The sheet rises from the bottom of the screen. */
	dialog {
		width: 100%;
		max-width: 600px;
		max-height: 80dvh;
		margin: auto auto 0;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--text);
	}
	dialog::backdrop {
		background: rgb(0 0 0 / 0.4);
	}
	.sheet {
		box-sizing: border-box;
		max-height: 80dvh;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
		background: var(--surface);
		border-radius: 16px 16px 0 0;
		box-shadow: 0 -6px 24px rgb(0 0 0 / 0.18);
	}
	dialog[open] .sheet {
		animation: rise 200ms ease-out;
	}
	@keyframes rise {
		from {
			transform: translateY(40%);
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		dialog[open] .sheet {
			animation: none;
		}
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.tabs {
		flex: 1 1 auto;
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: minmax(0, 1fr);
		gap: 4px;
		padding: 4px;
		background: var(--bg);
		border-radius: 10px;
	}
	.tabs button {
		min-height: 40px;
		padding: 0 4px;
		white-space: nowrap;
		font-size: 0.9rem;
		border: 0;
		border-radius: 7px;
		background: none;
		color: var(--muted);
	}
	.tabs button[aria-selected='true'] {
		background: var(--surface);
		color: var(--team);
		font-weight: 700;
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.15);
	}
	.close {
		width: 44px;
		height: 44px;
		flex: 0 0 auto;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: none;
		font-size: 1.5rem;
		line-height: 1;
		color: var(--muted);
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.head {
		display: flex;
		align-items: baseline;
		gap: 8px;
	}
	.head .title {
		font-size: 0.85rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--team);
	}
	.head .verdict {
		margin-left: auto;
		font-weight: 800;
	}
	.head .total {
		margin-left: auto;
		font-size: 1.9rem;
		font-weight: 800;
		line-height: 1;
		font-variant-numeric: tabular-nums;
		color: var(--team);
	}
	.head .verdict + .total {
		margin-left: 8px;
	}
	p {
		margin: 0;
	}
	.setup {
		font-size: 0.9rem;
	}
	.setup span,
	.note {
		color: var(--muted);
	}
	.note {
		font-size: 0.85rem;
	}
	.note.touch {
		color: var(--covered);
	}
	.maths {
		display: grid;
		gap: 6px;
		font-size: 0.95rem;
		line-height: 1.35;
	}
	.full {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		padding-top: 4px;
		border-top: 1px solid var(--border);
		font-size: 0.9rem;
		color: var(--muted);
		cursor: pointer;
	}
	.full input {
		width: 18px;
		height: 18px;
		accent-color: var(--block);
	}
</style>
