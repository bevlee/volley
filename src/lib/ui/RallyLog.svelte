<script lang="ts">
	import type { Game, LogEntry } from '#lib/engine/types.ts';
	import { narrate } from './story';

	let { game }: { game: Game } = $props();
	let showMaths = $state(false);

	const rallies = $derived.by(() => {
		const byRally = new Map<number, LogEntry[]>();
		for (const entry of game.log) {
			const list = byRally.get(entry.rally) ?? [];
			list.push(entry);
			byRally.set(entry.rally, list);
		}
		return [...byRally]
			.map(([rally, entries]) => ({ rally, entries, point: entries.find((e) => e.tag === 'point') }))
			.reverse();
	});
</script>

<section aria-label="Rally log">
	<label class="toggle"><input type="checkbox" bind:checked={showMaths} /> Show dice maths</label>
	{#each rallies as r, i (r.rally)}
		<details open={i === 0}>
			<summary>Rally {r.rally} · {r.point ? narrate(r.point) : 'in progress'}</summary>
			<ol>
				{#each r.entries as entry, j (j)}
					{@const said = narrate(entry)}
					<li class:point={entry.tag === 'point'}>
						{said}
						{#if showMaths && said !== entry.text}<span class="maths">{entry.text}</span>{/if}
					</li>
				{/each}
			</ol>
		</details>
	{/each}
</section>

<style>
	section {
		font-size: 0.9rem;
	}
	details {
		border-bottom: 1px solid var(--border);
		padding: 4px 0;
	}
	summary {
		cursor: pointer;
		color: var(--muted);
	}
	details[open] summary {
		color: var(--text);
	}
	ol {
		list-style: none;
		margin: 4px 0;
		padding-left: 16px;
	}
	.toggle {
		display: flex;
		gap: 6px;
		align-items: center;
		font-size: 0.8rem;
		color: var(--muted);
		margin-bottom: 4px;
	}
	.maths {
		display: block;
		font-family: ui-monospace, 'SF Mono', Menlo, monospace;
		font-size: 0.72rem;
		color: var(--muted);
	}
	li {
		padding: 1px 0;
	}
	.point {
		font-weight: 600;
	}
</style>
