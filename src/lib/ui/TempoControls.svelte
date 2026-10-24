<script lang="ts">
	import type { AttackOption, Channel, Stance, TeamId, Tempo, Touch } from '#lib/engine/types.ts';
	import { quickLine, shotLine, type TempoDefence } from './tempo';

	/**
	 * Advanced mode's calls, in place of the normal shot and defence buttons. Attacking a quick ball:
	 * line or cross, both hard. A high ball: where (line or cross) and how (hard, tip or roll), with hard
	 * drawn weak off a bad set. Defending: the block (line, cross, or pulling off against a high ball)
	 * and, unless the blocker pulls off or it's a quick ball, the defender's deep or short.
	 */
	let {
		kind,
		tempo,
		setMod,
		where,
		how,
		hitter,
		blocker,
		defender,
		team,
		defence = $bindable(),
		onwhere,
		onhow,
		onpreview,
		ongo
	}: {
		kind: 'attack' | 'defence';
		tempo: Tempo;
		setMod: number;
		/** The attack picked so far. */
		where: Channel;
		how: Touch;
		hitter: string;
		/** The defending pair, by name. */
		blocker: string;
		defender: string;
		/** The player's team, for the defender's colour. */
		team: TeamId;
		defence: TempoDefence;
		onwhere: (shot: Channel) => void;
		onhow: (touch: Touch) => void;
		/** Hovering an attack previews it on the court; null when it stops. */
		onpreview: (o: AttackOption | null) => void;
		/** Attack! or Lock in. */
		ongo: () => void;
	} = $props();

	const WHERE: { value: Channel; label: string; key: string }[] = [
		{ value: 'line', label: 'Line', key: '1' },
		{ value: 'cross', label: 'Cross', key: '2' }
	];
	const HOW: { value: Touch; label: string; key: string }[] = [
		{ value: 'hard', label: 'Hard', key: '3' },
		{ value: 'tip', label: 'Tip', key: '4' },
		{ value: 'roll', label: 'Roll', key: '5' }
	];
	const STANCES: { value: Stance; label: string; key: string }[] = [
		{ value: 'deep', label: 'Deep', key: '3' },
		{ value: 'short', label: 'Short', key: '4' }
	];

	const quick = $derived(tempo === 'fast');
	const stayDown = $derived(!quick && defence.blockMode === 'none');
	/** Off a bad set a hard hit is weak: still pickable, but drawn that way. */
	const weakHard = $derived(setMod < 0);

	/** Buttons drop focus after a click, so Space keeps meaning Attack! or Lock in. */
	function run(e: MouseEvent, action: () => void) {
		(e.currentTarget as HTMLElement).blur();
		action();
	}
	const preview = (o: AttackOption) => ({ onmouseenter: () => onpreview(o), onmouseleave: () => onpreview(null) });
	const block = (b: Channel) => {
		defence.block = b;
		defence.blockMode = 'commit';
	};
</script>

<div class="calls">
	{#if kind === 'attack' && quick}
		<div class="big" role="group" aria-label="Shot">
			{#each WHERE as w (w.value)}
				<button
					class:on={where === w.value}
					aria-pressed={where === w.value}
					onclick={(e) => run(e, () => onwhere(w.value))}
					{...preview({ shot: w.value, touch: 'hard' })}
				>
					<span class="name">{w.label}</span>
					<span class="sub">hard · key {w.key}</span>
				</button>
			{/each}
		</div>
		<p class="note">{quickLine(blocker)}</p>
		<button class="go" onclick={(e) => run(e, ongo)}>Attack! <kbd>Space</kbd></button>
	{:else if kind === 'attack'}
		<div class="grid two" role="group" aria-label="Where">
			<span class="label">Where</span>
			{#each WHERE as w (w.value)}
				<button
					class="where"
					class:on={where === w.value}
					aria-pressed={where === w.value}
					onclick={(e) => run(e, () => onwhere(w.value))}
					{...preview({ shot: w.value, touch: how })}
				>
					{w.label} <kbd>{w.key}</kbd>
				</button>
			{/each}
		</div>
		<div class="grid three" role="group" aria-label="How">
			<span class="label">How</span>
			{#each HOW as h (h.value)}
				<button
					class="how"
					class:on={how === h.value}
					class:weak={h.value === 'hard' && weakHard}
					aria-pressed={how === h.value}
					title={h.value === 'hard' && weakHard ? 'Weak off this set' : undefined}
					onclick={(e) => run(e, () => onhow(h.value))}
					{...preview({ shot: where, touch: h.value })}
				>
					{h.label} <kbd>{h.key}</kbd>
				</button>
			{/each}
		</div>
		<div class="foot">
			<p class="note left">{shotLine(where, how, setMod)}</p>
			<button class="go small" onclick={(e) => run(e, ongo)}>Attack! <kbd>Space</kbd></button>
		</div>
	{:else}
		<div class="grid {quick ? 'two' : 'three'} wide" role="group" aria-label="Block">
			<span class="label block-label">{blocker}<br />blocks</span>
			{#each WHERE as w (w.value)}
				{@const on = defence.block === w.value && !stayDown}
				<button class="block" class:on aria-pressed={on} onclick={(e) => run(e, () => block(w.value))}>
					{w.label} <kbd>{w.key}</kbd>
				</button>
			{/each}
			{#if !quick}
				<button class="block" class:on={stayDown} aria-pressed={stayDown} onclick={(e) => run(e, () => (defence.blockMode = 'none'))}>
					Pull off <kbd>9</kbd>
				</button>
			{/if}
		</div>
		{#if !quick}
			<div class="grid two wide {team}" role="group" aria-label="Dig">
				<span class="label dig-label">{defender}<br />{stayDown ? 'digs too' : 'plays'}</span>
				{#each STANCES as d (d.value)}
					{@const on = defence.stance === d.value && !stayDown}
					<button class="dig" class:on aria-pressed={on} disabled={stayDown} onclick={(e) => run(e, () => (defence.stance = d.value))}>
						{d.label} <kbd>{d.key}</kbd>
					</button>
				{/each}
			</div>
			<p class="note">
				{stayDown
					? `No block: every ball is a scramble for ${defender} and ${blocker}, with help on the dig.`
					: `A soft shot goes over the block. Read where ${hitter} puts it.`}
			</p>
		{:else}
			<p class="note">{defender} has no time to move. Guess the block: if it's wrong, it's a kill.</p>
		{/if}
		<button class="go" onclick={(e) => run(e, ongo)}>Lock in <kbd>Space</kbd></button>
	{/if}
</div>

<style>
	.calls {
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: 100%;
		max-width: 26rem;
	}
	p {
		margin: 0;
	}
	button {
		min-height: 44px;
		border-radius: 8px;
		font-size: 15px;
		font-weight: 600;
		white-space: nowrap;
	}
	.big {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.big button {
		min-height: 52px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		line-height: 1.15;
	}
	.name {
		font-size: 16px;
		font-weight: 700;
	}
	.sub {
		font-size: 11px;
		color: var(--muted);
		font-weight: 500;
	}
	.grid {
		display: grid;
		gap: 6px;
		align-items: center;
	}
	.grid.two {
		grid-template-columns: 44px 1fr 1fr;
	}
	.grid.three {
		grid-template-columns: 44px 1fr 1fr 1fr;
	}
	.grid.wide.two {
		grid-template-columns: 72px 1fr 1fr;
	}
	.grid.wide.three {
		grid-template-columns: 72px 1fr 1fr 1fr;
	}
	.label {
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted);
		line-height: 1.2;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.block-label {
		color: var(--block);
	}
	.A .dig-label {
		color: var(--team-a);
	}
	.B .dig-label {
		color: var(--team-b);
	}
	.big button.on,
	.where.on {
		background: var(--actual);
		border-color: var(--actual);
		color: #fff;
		font-weight: 700;
	}
	.big button.on .sub {
		color: inherit;
		opacity: 0.85;
	}
	.how.on {
		background: color-mix(in srgb, var(--actual) 12%, var(--surface));
		border: 2px solid var(--actual);
		color: var(--actual);
		font-weight: 700;
	}
	.how.weak:not(.on) {
		background: transparent;
		border-style: dashed;
		color: var(--muted);
		font-weight: 500;
	}
	.how.weak.on {
		border-style: dashed;
	}
	.block.on {
		background: var(--block);
		border-color: var(--block);
		color: var(--bg);
		font-weight: 700;
	}
	.A .dig.on {
		background: var(--team-a);
		border-color: var(--team-a);
		color: var(--bg);
		font-weight: 700;
	}
	.B .dig.on {
		background: var(--team-b);
		border-color: var(--team-b);
		color: var(--bg);
		font-weight: 700;
	}
	.dig:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.note {
		font-size: 12.5px;
		color: var(--muted);
		text-align: center;
		text-wrap: pretty;
	}
	.note.left {
		flex: 1;
		text-align: left;
		line-height: 1.35;
	}
	.foot {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.go {
		background: var(--text);
		color: var(--bg);
		border-color: var(--text);
		font-size: 16px;
		font-weight: 700;
		min-height: 40px;
	}
	.go.small {
		min-height: 36px;
		padding: 6px 14px;
	}
	kbd {
		font-size: 0.65rem;
		opacity: 0.7;
		border: 1px solid currentColor;
		border-radius: 3px;
		padding: 0 3px;
		margin-left: 4px;
		font-weight: 500;
	}
	@media (hover: none) {
		kbd,
		.sub {
			display: none;
		}
	}
</style>
