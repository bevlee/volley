<script lang="ts">
	import type { ScaleRow, Score, ScoreSheet, Term } from './scores';

	let { sheet }: { sheet: ScoreSheet | null } = $props();

	const FULL_KEY = 'volley:full-maths';
	/** Off by default: the hover shows the short breakdown. On adds what every number means, and the aim. */
	let full = $state(false);
	// Read the saved choice once in the browser, so the server-rendered page and the first paint agree.
	$effect(() => {
		try {
			full = localStorage.getItem(FULL_KEY) === '1';
		} catch {
			// Storage can be blocked; keep the default.
		}
	});
	function save() {
		try {
			localStorage.setItem(FULL_KEY, full ? '1' : '0');
		} catch {
			// Private windows can refuse storage; the toggle still works for this visit.
		}
	}

	const TOTAL_TIP = {
		attack: 'What the block and the dig have to beat.',
		block: 'Beat the attack by 3 or more to stuff it. Within 2 is a touch. Lose by 3 or more and it goes through to the dig.',
		dig: 'Match or beat the attack to dig it up. Otherwise it’s a kill.'
	};
	const AIM: Record<string, string> = { exact: 'on target', drift: 'drifts a zone', block: 'into the block', easy: 'easy ball over' };

	const signed = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`);
	/** The set's bonus and where the ball went. Before the shot is called it's what a hard hit would get. */
	const setLine = (s: ScoreSheet) =>
		(s.shot === 'tip' ? `${signed(s.setBonus)} to the tip` : `${signed(s.setBonus)} to ${s.shot ? 'the' : 'a hard'} hit`) +
		(s.aim ? ` · ${AIM[s.aim.result]}` : '');
</script>

{#snippet scale(rows: ScaleRow[])}
	<span class="scale">
		{#each rows as r (r.label)}
			<span class="scale-row" class:on={r.on}><span>{r.label}</span><span>{r.value}</span></span>
		{/each}
	</span>
{/snippet}

{#snippet row(t: Term, sub = false)}
	<span class="row" class:sub>
		<span class="label">{t.label}</span>
		<span class="value">{t.value}</span>
		{#if t.note}<span class="note-line">{t.note}</span>{/if}
		{#if full && t.tip}<span class="tip">{t.tip}</span>{/if}
		{#if full && t.scale}{@render scale(t.scale)}{/if}
	</span>
	{#each t.parts ?? [] as p (p.label)}{@render row(p, true)}{/each}
{/snippet}

{#snippet card(title: string, kind: keyof typeof TOTAL_TIP, s: Score, extra?: { setup?: string[]; set?: string })}
	<!-- Only the result shows; hovering or focusing the card reveals how it was worked out. -->
	<button type="button" class="card {s.team}" aria-label="{title} {s.who}: {s.total ?? 'not rolled yet'}{s.verdict ? `, ${s.verdict}` : ''}">
		<span class="head">
			<span class="title">{title}</span>
			<span class="who">{s.who}</span>
			{#if s.verdict}<span class="verdict">{s.verdict}</span>{/if}
			<!-- "?" means not rolled yet; "–" means there's a result but no sum (a perfect set and hit, or an error). -->
			<span class="total">{s.total ?? (s.verdict ? '–' : '?')}</span>
		</span>
		{#if extra?.setup}<span class="setup">{extra.setup.join(' → ')}</span>{/if}
		{#if extra?.set}<span class="set">{extra.set}</span>{/if}
		<span class="breakdown" role="tooltip">
			{#each s.terms as t (t.label)}{@render row(t)}{/each}
			<span class="row sum">
				<span class="label">Total</span>
				<span class="value">{s.total ?? '?'}</span>
				<span class="note-line">{s.totalNote}</span>
				{#if full}<span class="tip">{TOTAL_TIP[kind]}</span>{/if}
			</span>
			{#if full && kind === 'attack' && sheet?.aim}
				<span class="section">Where it lands</span>
				{#each sheet.aim.terms as t (t.label)}{@render row(t, true)}{/each}
				<span class="row sum">
					<span class="label">Aim</span>
					<span class="value">{sheet.aim.total}</span>
					{@render scale(sheet.aim.scale)}
				</span>
			{/if}
		</span>
	</button>
{/snippet}

<aside class="scores" aria-label="Attack and defence scores">
	{#if sheet}
		{@render card('Attack', 'attack', sheet.attack, { setup: sheet.setup, set: setLine(sheet) })}
		{#if sheet.note}<p class="note touch">{sheet.note}</p>{/if}
		{#if sheet.block}
			{@render card('Block', 'block', sheet.block)}
		{:else if sheet.blockNote}
			<p class="note">{sheet.blockNote}</p>
		{/if}
		{#if sheet.dig}{@render card('Dig', 'dig', sheet.dig)}{/if}
	{:else}
		<p class="note">Attack and defence scores show here once a ball is set.</p>
	{/if}
	<p class="hint">
		Hover a score to see how it adds up.
		<label><input type="checkbox" bind:checked={full} onchange={save} /> Full maths</label>
	</p>
</aside>

<style>
	.scores {
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: 100%;
	}
	.card {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 2px;
		width: 100%;
		text-align: left;
		font: inherit;
		color: inherit;
		background: var(--surface);
		border: 1px solid var(--border);
		border-left: 4px solid var(--team);
		border-radius: 0 8px 8px 0;
		padding: 6px 10px;
		cursor: help;
	}
	.A {
		--team: var(--team-a);
	}
	.B {
		--team: var(--team-b);
	}
	.card:focus-visible {
		outline: 2px solid var(--block);
		outline-offset: 2px;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		font-size: 0.8rem;
	}
	.title {
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--team);
	}
	.who {
		color: var(--muted);
	}
	.verdict {
		margin-left: auto;
		font-weight: 800;
	}
	.total {
		margin-left: auto;
		font-size: 1.5rem;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
		line-height: 1.1;
		color: var(--team);
	}
	.verdict + .total {
		margin-left: 8px;
	}
	.setup {
		font-size: 0.8rem;
		font-weight: 700;
	}
	.set {
		font-size: 0.75rem;
		color: var(--muted);
	}
	.breakdown {
		display: none;
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		z-index: 5;
		width: 17rem;
		padding: 8px 10px;
		border-radius: 8px;
		background: var(--text);
		color: var(--bg);
		font-size: 0.82rem;
		line-height: 1.3;
		/* It only shows information; letting the mouse through means it closes as soon as you leave the card. */
		pointer-events: none;
	}
	.card:hover .breakdown,
	.card:focus-visible .breakdown {
		display: grid;
		gap: 4px;
	}
	.row {
		display: grid;
		grid-template-columns: 1fr auto;
		column-gap: 8px;
	}
	.row .label {
		font-weight: 700;
	}
	.row .value {
		font-weight: 800;
		font-variant-numeric: tabular-nums;
	}
	.row.sub {
		padding-left: 12px;
		font-size: 0.76rem;
		opacity: 0.85;
	}
	.row.sub .label {
		font-weight: 400;
	}
	.note-line,
	.tip {
		grid-column: 1 / -1;
		font-size: 0.74rem;
		opacity: 0.75;
	}
	.tip {
		font-style: italic;
	}
	/* The possible outcomes, one per line, with the one that happened picked out. */
	.scale {
		grid-column: 1 / -1;
		display: grid;
		margin: 3px 0 2px;
		font-size: 0.74rem;
	}
	.scale-row {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 8px;
		padding: 1px 6px;
		border-radius: 4px;
		opacity: 0.6;
	}
	.scale-row.on {
		opacity: 1;
		font-weight: 800;
		background: color-mix(in srgb, currentColor 18%, transparent);
	}
	.row.sum {
		border-top: 1px solid currentColor;
		padding-top: 4px;
		margin-top: 2px;
	}
	.section {
		margin-top: 6px;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		opacity: 0.75;
	}
	.note {
		margin: 0;
		font-size: 0.8rem;
		color: var(--muted);
	}
	.note.touch {
		margin: -4px 0 0 14px;
		color: var(--covered);
	}
	.hint {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 4px 8px;
		font-size: 0.72rem;
		color: var(--muted);
	}
	.hint label {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		cursor: pointer;
	}
</style>
