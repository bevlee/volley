<script lang="ts">
	import type { SaveState } from './saveGame';

	/** At game over, under the court: whether the game was saved, with a link to its replay. */
	let { save }: { save: SaveState | null } = $props();
</script>

{#if save}
	<p class="saved" class:failed={save.kind === 'failed'}>
		{#if save.kind === 'saving'}
			Saving the game…
		{:else if save.kind === 'saved'}
			Game saved · <a href="/replay/{save.id}">Watch the replay</a> · <a href="/history">Your games</a>
		{:else}
			{save.message}
		{/if}
	</p>
{/if}

<style>
	.saved {
		margin: 6px 0 0;
		text-align: center;
		font-size: 0.9rem;
		color: var(--muted);
	}
	.saved a {
		color: var(--text);
		font-weight: 600;
	}
	.failed {
		color: var(--text);
	}
</style>
