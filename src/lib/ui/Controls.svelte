<script lang="ts">
	import type { Snippet } from 'svelte';
	import { config } from '#lib/engine/config.ts';
	import type { AttackOption, BlockMode, Channel, DefenceSpecial, Stance } from '#lib/engine/types.ts';

	let {
		status,
		feed = null,
		choosing,
		defending,
		defence = $bindable(),
		ondefend,
		choices,
		modes = null,
		pick,
		onpick,
		onattack,
		onpreview,
		over,
		next,
		busy = false,
		stepDisabled = false,
		onstep,
		overLabel = 'New game',
		overDisabled = false,
		onnewgame,
		charges = null,
		special = $bindable(false),
		spend = $bindable('none'),
		calls = null,
		reveal = null
	}: {
		/** One line on whose call it is or what just happened. */
		status: string;
		/** The rally's commentary so far, shown above the status; null for just the status. */
		feed?: string[] | null;
		/** It's the player's attack: show the shot buttons instead of Step. */
		choosing: boolean;
		/** It's the other team's attack: show the block and dig choices. */
		defending: boolean;
		defence: { block: Channel; stance: Stance; blockMode: BlockMode };
		ondefend: () => void;
		/** The attacks the player can pick from, in key order (1, 2, 3…). */
		choices: (AttackOption & { label: string })[];
		/** How the blocker can play it, when block modes are in play; null hides the choice. */
		modes?: BlockMode[] | null;
		/** The attack picked for the player's attack. */
		pick: AttackOption;
		/** Picks an attack; it doesn't hit it. */
		onpick: (pick: AttackOption) => void;
		/** Hits the picked shot: the calls are revealed, then the attack rolls. */
		onattack: () => void;
		/** Hovering or focusing a shot previews it on the court; null when it stops. */
		onpreview: (o: AttackOption | null) => void;
		over: boolean;
		/** What the next step does, e.g. "Attack!", or what it's waiting for online. */
		next: string;
		/** Play is running on its own: the step button waits (Space still skips ahead). */
		busy?: boolean;
		/** Online, when it's the other player's move. */
		stepDisabled?: boolean;
		onstep: () => void;
		/** The game-over button: "New game", or "Rematch" online. */
		overLabel?: string;
		overDisabled?: boolean;
		onnewgame: () => void;
		/** The ?specials prototype: the charges the hitter, blocker and digger have for this call; null when charges are off. */
		charges?: { hitter: string; hitterPips: number; blocker: string; blockerPips: number; digger: string; diggerPips: number } | null;
		/** The player's attack spends one of the hitter's charges. */
		special?: boolean;
		/** The player's defence spends one of the blocker's or digger's charges. */
		spend?: DefenceSpecial;
		/** Advanced mode: its own attack and defence calls, in place of these; null for a normal game. */
		calls?: Snippet | null;
		/** Advanced mode: what the block and dig did to the latest hit, over the step button. */
		reveal?: Snippet | null;
	} = $props();

	const toggleSpend = (on: DefenceSpecial) => (spend = spend === on ? 'none' : on);

	// The feed keeps the latest line in view.
	let feedBox = $state<HTMLElement>();
	$effect(() => {
		if (feed?.length && feedBox) feedBox.scrollTop = feedBox.scrollHeight;
	});

	function run(e: MouseEvent, action: () => void) {
		(e.currentTarget as HTMLElement).blur();
		action();
	}

	const picked = (o: AttackOption) => o.shot === pick.shot && o.tempo === pick.tempo;
	const MODES: { value: BlockMode; label: string; key: string }[] = [
		{ value: 'commit', label: 'Commit', key: '7' },
		{ value: 'read', label: 'Read', key: '8' },
		{ value: 'none', label: 'No block', key: '9' }
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
	{#if feed}
		<ol class="feed" bind:this={feedBox} aria-label="Commentary" aria-live="polite">
			{#each feed as line, i (i)}
				<li class:latest={i === feed.length - 1}>{line}</li>
			{:else}
				<li class="latest">&nbsp;</li>
			{/each}
		</ol>
	{/if}
	<p class="status" aria-live="polite">{status}</p>
	{#if calls && (choosing || defending) && !over}
		{@render calls()}
	{:else}
	{#if reveal}{@render reveal()}{/if}
	<div class="row">
		{#if over}
			<button class="primary" disabled={overDisabled} onclick={(e) => run(e, onnewgame)}>{overLabel}</button>
		{:else if choosing}
			<span class="group" role="group" aria-label="Shot">
				{#each choices as c, i (`${c.tempo}-${c.shot}`)}
					<button
						class:on={picked(c)}
						aria-pressed={picked(c)}
						onclick={(e) => run(e, () => onpick(c))}
						onmouseenter={() => onpreview(c)}
						onmouseleave={() => onpreview(null)}
						onfocus={() => onpreview(c)}
						onblur={() => onpreview(null)}
					>
						{c.label} <kbd>{i + 1}</kbd>
					</button>
				{/each}
			</span>
			{#if charges}
				<button
					class="special"
					class:on={special}
					aria-pressed={special}
					disabled={charges.hitterPips === 0}
					title={charges.hitterPips ? `Spend one of ${charges.hitter}'s ${charges.hitterPips} charges` : `${charges.hitter} has no charges`}
					onclick={(e) => run(e, () => (special = !special))}
				>
					★ Special <small>+{config.specialHitAccuracy} aim · +{config.specialHitPower} power</small> <kbd>S</kbd>
				</button>
			{/if}
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
			{#if modes}
				<span class="group" role="group" aria-label="Block mode">
					{#each MODES.filter((m) => modes.includes(m.value)) as m (m.value)}
						<button class:on={defence.blockMode === m.value} aria-pressed={defence.blockMode === m.value} onclick={(e) => run(e, () => (defence.blockMode = m.value))}>
							{m.label} <kbd>{m.key}</kbd>
						</button>
					{/each}
				</span>
			{/if}
			{#if charges}
				<span class="group" role="group" aria-label="Special">
					<span class="group-label">★</span>
					<button
						class="special"
						class:on={spend === 'block'}
						aria-pressed={spend === 'block'}
						disabled={charges.blockerPips === 0}
						title={charges.blockerPips ? `Spend one of ${charges.blocker}'s ${charges.blockerPips} charges` : `${charges.blocker} has no charges`}
						onclick={(e) => run(e, () => toggleSpend('block'))}
					>
						Block +{config.specialBlock} <kbd>5</kbd>
					</button>
					<button
						class="special"
						class:on={spend === 'dig'}
						aria-pressed={spend === 'dig'}
						disabled={charges.diggerPips === 0}
						title={charges.diggerPips ? `Spend one of ${charges.digger}'s ${charges.diggerPips} charges` : `${charges.digger} has no charges`}
						onclick={(e) => run(e, () => toggleSpend('dig'))}
					>
						Dig +{config.specialDig} <kbd>6</kbd>
					</button>
				</span>
			{/if}
			<button class="primary" onclick={(e) => run(e, ondefend)}>Lock in <kbd>Space</kbd></button>
		{:else}
			<button class="primary wide" disabled={busy || stepDisabled} onclick={(e) => run(e, onstep)} title="Space or → also steps">
				{next}{#if !stepDisabled}&nbsp;<kbd>Space</kbd>{/if}
			</button>
		{/if}
	</div>
	{#if choosing}
		<p class="hint">
			Pick a shot, then Space to hit it. A hard shot gets stuffed if they block it. A tip gets dug if their defender creeps short.
			{#if charges}<span class="star">★</span> Great touches earn charges; a special spends one of {charges.hitter}'s.{/if}
		</p>
	{:else if defending}
		<p class="hint">
			<span class="bad">Red</span> is covered, <span class="ok">green</span> is open.
			{#if modes}Commit takes the channel; read starts there and may get across, but late; no block helps the dig.{/if}
			{#if charges}<span class="star">★</span> A special is spent when you lock in, even if they hit somewhere else.{/if}
		</p>
	{/if}
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
	/* Four lines of the rally, the latest at the bottom in full, earlier ones fading up. */
	.feed {
		box-sizing: border-box;
		width: 100%;
		height: calc(4 * 1.4em + 12px);
		margin: 0;
		padding: 6px 12px;
		overflow-y: auto;
		scrollbar-width: none;
		list-style: none;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		font-size: 0.85rem;
		line-height: 1.4;
		color: var(--muted);
	}
	.feed .latest {
		color: var(--text);
		font-weight: 700;
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
	.primary:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.group {
		display: inline-flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: center;
		gap: 4px;
	}
	/* With more choices than fit (run mode's attacks), the row wraps rather than squashing the labels. */
	.group button {
		white-space: nowrap;
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
	.special {
		border-color: var(--special);
		color: var(--special);
		font-weight: 700;
	}
	.special small {
		font-weight: 500;
		opacity: 0.85;
	}
	.special.on {
		background: var(--special);
		border-color: var(--special);
		color: var(--bg);
	}
	.special:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.star {
		color: var(--special);
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
