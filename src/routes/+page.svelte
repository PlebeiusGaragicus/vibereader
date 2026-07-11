<script lang="ts">
	import { base } from '$app/paths';
	import { Cyphertap, cyphertap } from 'cyphertap';
	import { BookOpen, Settings } from '@lucide/svelte';
	import SettingsPanel from '$lib/components/SettingsPanel.svelte';
	import LibraryView from '$lib/components/library/LibraryView.svelte';
	import ReaderView from '$lib/components/reader/ReaderView.svelte';
	import { RELAYS } from '$lib/relays.js';
	import { library } from '$lib/stores/library.svelte.js';
	import { session } from '$lib/stores/session.svelte.js';
	import { ui } from '$lib/stores/ui.svelte.js';

	// Bridge cyphertap's identity to the session (and per-npub DB) lifecycle.
	$effect(() => {
		const npub = cyphertap.npub;
		if (cyphertap.isLoggedIn && npub) void session.start(npub);
		else if (!cyphertap.isLoggedIn && session.activeNpub) void session.stop();
	});
</script>

<div class="flex h-full flex-col">
	{#if ui.view === 'library'}
		<header
			class="flex items-center justify-between gap-4 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800"
		>
			<div class="flex items-center gap-2">
				<BookOpen class="size-5 text-amber-600 dark:text-amber-500" />
				<h1 class="text-lg font-semibold">VibeReader</h1>
			</div>
			<div class="flex items-center gap-3">
				<a
					href="{base}/docs/"
					class="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
				>
					Docs
				</a>
				<button
					class="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
					title="Settings"
					onclick={() => (ui.settingsOpen = true)}
				>
					<Settings class="size-4" />
				</button>
				<Cyphertap relays={RELAYS} />
			</div>
		</header>
	{/if}

	<main class="min-h-0 flex-1">
		{#if !cyphertap.isLoggedIn}
			<div class="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
				<BookOpen class="size-12 text-zinc-300 dark:text-zinc-700" />
				<h2 class="text-xl font-medium">A local-first EPUB reader on nostr</h2>
				<p class="max-w-md text-sm text-zinc-500">
					Log in with a nostr key to open your library. Your books, annotations, and reading
					progress live in this browser — nothing leaves it unless you say so.
				</p>
			</div>
		{:else if ui.view === 'library' && library}
			<LibraryView />
		{:else}
			<ReaderView />
		{/if}
	</main>
</div>

{#if ui.settingsOpen}
	<SettingsPanel />
{/if}
