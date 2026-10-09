<script lang="ts">
	import CourtLoop from '#lib/ui/CourtLoop.svelte';
	import Menu from '#lib/ui/Menu.svelte';
</script>

<svelte:head>
	<title>Volley</title>
</svelte:head>

<Menu title="Volley" subtitle="2v2 beach volleyball with dice. First to 21, win by 2.">
	{#snippet art()}<CourtLoop />{/snippet}
	<a class="choice" href="/computer"><b>Play vs computer</b></a>
	<a class="choice" href="/online"><b>Play vs opponent</b></a>
	<a class="choice" href="/history"><b>Your games</b><span>Watch your finished games again.</span></a>
</Menu>
