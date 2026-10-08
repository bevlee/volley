<script lang="ts">
	import Menu from '#lib/ui/Menu.svelte';
</script>

<svelte:head>
	<title>Volley</title>
</svelte:head>

<Menu title="Volley" subtitle="2v2 beach volleyball with dice. First to 21, win by 2.">
	<a class="choice" href="/computer">
		<b>Play vs computer</b>
		<span>You call for Team A; the computer calls for B.</span>
	</a>
	<a class="choice" href="/online">
		<b>Play vs opponent</b>
		<span>Make a room and send the code, or join with one.</span>
	</a>
</Menu>
