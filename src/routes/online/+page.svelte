<script lang="ts">
	import { onDestroy } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { other } from '#lib/engine/rally.ts';
	import type { Game } from '#lib/engine/types.ts';
	import { isCode, normaliseCode } from '#lib/online/codes.ts';
	import { Online } from '#lib/online/connection.svelte.ts';
	import GameScreen from '#lib/ui/GameScreen.svelte';
	import Menu from '#lib/ui/Menu.svelte';
	import TurnClock from '#lib/ui/TurnClock.svelte';

	/**
	 * Play vs opponent: make a room or join one by code, wait for the other player, then play. The
	 * server runs the game; this page shows it and sends the player's moves. `?code=KXQT` (an invite
	 * link) joins straight away.
	 */

	let screen = $state<GameScreen>();
	let shown = $state.raw<Game>();
	let idle = $state(true);
	let codeInput = $state('');
	let busy = $state(false);

	const online = new Online({
		chain: (chain) => screen?.playChain(chain),
		snapshot: (game) => screen?.jumpTo(game),
		timedOut(team, action) {
			const what = action === 'serve' ? 'served' : 'made the call';
			toast(team === online.team ? `Time's up: the computer ${what} for you` : `They ran out of time: the computer ${what} for them`);
		},
		welcome(seated) {
			if (!seated) joinFromLink();
		}
	});
	onDestroy(() => online.close());

	/** An invite link's code: joined once, then dropped from the address so a reload doesn't rejoin. */
	function joinFromLink() {
		const code = page.url.searchParams.get('code');
		if (!code) return;
		replaceState('/online', {});
		codeInput = code;
		join(code);
	}

	const notValid = () => toast.error('Not valid');

	async function join(raw: string) {
		const code = normaliseCode(raw);
		if (!isCode(code)) return notValid();
		busy = true;
		const result = await online.join(code);
		busy = false;
		if (result === 'missing') notValid();
		if (result === 'full') toast.error('That game is full');
	}

	async function create() {
		busy = true;
		await online.create();
		busy = false;
	}

	async function copyLink() {
		const link = `${location.origin}/online?code=${online.code}`;
		try {
			await navigator.clipboard.writeText(link);
			toast.success('Invite link copied');
		} catch {
			toast(link);
		}
	}

	function leave() {
		const playing = online.stage === 'playing' && online.latest?.phase.kind !== 'gameOver';
		if (playing && !confirm('Leave this game? Your seat goes to whoever joins with the code next.')) return;
		online.leave();
		codeInput = '';
	}

	const you = $derived(online.team);
	const g = $derived(shown ?? online.latest);
	const mineIn = $derived(!!you && online.locked.includes(you));
	const theirsIn = $derived(!!you && online.locked.includes(other(you)));

	/** What the step button and status line say while the game waits on someone. */
	const waiting = $derived.by(() => {
		if (!g || !you) return { status: null, label: null, disabled: false };
		if (!online.connected) return { status: 'Reconnecting…', label: 'Reconnecting…', disabled: true };
		const p = g.phase.kind;
		if (p === 'serve' || p === 'pointOver') {
			if (g.serving === you) return { status: null, label: null, disabled: false };
			const server = g.teams[g.serving][g.servers[g.serving]].name;
			return { status: null, label: `${server} to serve`, disabled: true };
		}
		if (p === 'calls' && mineIn) return { status: `Locked in · waiting for Team ${other(you)}`, label: 'Locked in', disabled: true };
		if (p === 'calls' && theirsIn) return { status: 'Their call is in · your move', label: null, disabled: false };
		return { status: null, label: null, disabled: false };
	});

	const presence = $derived(
		online.opponent === 'connected' ? 'Opponent here' : online.opponent === 'away' ? 'Opponent away' : 'Seat empty: waiting for someone to join'
	);

	const rematchLabel = $derived(
		you && online.rematch.includes(you) ? 'Waiting for them…' : online.rematch.length ? 'Rematch · they want one' : 'Rematch'
	);
</script>

<svelte:head>
	<title>Volley · vs opponent</title>
</svelte:head>

{#if online.stage === 'playing' && online.latest}
	<GameScreen
		bind:this={screen}
		bind:shown
		bind:idle
		initial={online.latest}
		controlled={you}
		{you}
		locked={mineIn}
		status={waiting.status}
		stepLabel={waiting.label}
		stepDisabled={waiting.disabled}
		overLabel={rematchLabel}
		overDisabled={!!you && online.rematch.includes(you)}
		onadvance={() => online.serve(screen!.latest().steps)}
		onshot={(shot) => online.shot(screen!.latest().steps, shot)}
		ondefence={(d) => online.defence(screen!.latest().steps, d)}
		onover={() => online.askRematch()}
		extraHeight={80}
	>
		{#snippet banner()}
			<div class="room">
				<span>Room <b>{online.code}</b></span>
				<span class="presence" class:away={online.opponent !== 'connected'}>{presence}</span>
				<button onclick={leave}>Leave game</button>
			</div>
		{/snippet}
		{#snippet dock()}
			{#if idle}<TurnClock clock={online.clock} {you} />{/if}
		{/snippet}
	</GameScreen>
{:else if online.stage === 'waiting'}
	<Menu title="Room {online.code}" subtitle="Send the code to your opponent, or the invite link." back={{ href: '/', label: 'Volley' }}>
		<p class="code" aria-label="Room code">{online.code}</p>
		<button class="choice" onclick={copyLink}>
			<b>Copy invite link</b>
			<span>Opens the game for them straight away.</span>
		</button>
		<p class="note">Waiting for your opponent…</p>
		<button class="cancel" onclick={leave}>Cancel</button>
	</Menu>
{:else}
	<Menu title="Play vs opponent" subtitle="One of you makes a room, the other joins with its code." back={{ href: '/', label: 'Volley' }}>
		{#if online.stage === 'connecting'}
			<p class="note">Connecting…</p>
		{:else if online.stage === 'offline'}
			<p class="note">Can't reach the game server. Trying again…</p>
		{:else}
			<button class="choice" disabled={busy} onclick={create}>
				<b>Create room</b>
				<span>You get a code to send to your opponent.</span>
			</button>
			<form
				class="choice join"
				onsubmit={(e) => {
					e.preventDefault();
					join(codeInput);
				}}
			>
				<label for="code"><b>Join game</b></label>
				<span>Enter the room code you were sent.</span>
				<div class="row">
					<input
						id="code"
						bind:value={codeInput}
						placeholder="KXQT"
						autocomplete="off"
						autocapitalize="characters"
						spellcheck="false"
						maxlength="8"
					/>
					<button type="submit" disabled={busy || !codeInput.trim()}>Join</button>
				</div>
			</form>
		{/if}
	</Menu>
{/if}

<style>
	.room {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 4px 12px;
		font-size: 0.85rem;
		padding-bottom: 4px;
	}
	.room b {
		letter-spacing: 0.1em;
	}
	.presence {
		color: var(--open);
	}
	.presence.away {
		color: var(--covered);
	}
	.room button {
		font-size: 0.8rem;
		padding: 2px 10px;
	}
	.code {
		margin: 0;
		font-size: 3rem;
		font-weight: 800;
		letter-spacing: 0.25em;
		text-align: center;
	}
	.note {
		margin: 0;
		color: var(--muted);
		text-align: center;
	}
	.cancel {
		align-self: center;
	}
	.join {
		cursor: default;
	}
	.row {
		display: flex;
		gap: 8px;
		margin-top: 6px;
	}
	.row input {
		flex: 1;
		min-width: 0;
		font-size: 1.2rem;
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}
	.row input::placeholder {
		letter-spacing: 0.15em;
		opacity: 0.4;
	}
	.row button {
		font-weight: 700;
	}
</style>
