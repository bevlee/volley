<script lang="ts">
	import { tick } from 'svelte';
	import { NAME_MAX } from '#lib/online/names.ts';

	/**
	 * "Playing as Bev · change": the player's name, and a way to change it in place. Enter or leaving
	 * the box saves; Escape cancels. A name that cleans to nothing isn't saved.
	 */
	let { name, prefix = 'Playing as', onsave }: { name: string; prefix?: string; onsave: (raw: string) => boolean } = $props();

	let editing = $state(false);
	let draft = $state('');
	let input = $state<HTMLInputElement>();

	async function edit() {
		draft = name;
		editing = true;
		await tick();
		input?.select();
	}

	function save() {
		if (!editing) return;
		editing = false;
		if (draft.trim() && draft !== name) onsave(draft);
	}
</script>

{#if editing}
	<input
		class="name-input"
		bind:this={input}
		bind:value={draft}
		maxlength={NAME_MAX}
		aria-label="Your name"
		onblur={save}
		onkeydown={(e) => {
			if (e.key === 'Enter') save();
			if (e.key === 'Escape') editing = false;
		}}
	/>
{:else}
	<span class="name-line">
		{prefix} <b>{name}</b>
		<button class="link" onclick={edit} aria-label="Change your name">change</button>
	</span>
{/if}

<style>
	.name-line {
		white-space: nowrap;
	}
	.link {
		border: none;
		background: none;
		padding: 0 2px;
		color: var(--muted);
		text-decoration: underline;
		cursor: pointer;
		font-size: 0.9em;
	}
	.link:hover {
		color: var(--text);
	}
	.name-input {
		width: 10rem;
		padding: 1px 8px;
	}
</style>
