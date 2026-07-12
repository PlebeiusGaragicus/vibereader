<script lang="ts">
	import { CloudDownload, CloudUpload, Ellipsis, Info, Loader2, Trash2 } from '@lucide/svelte';
	import type { Book } from '$lib/db/types.js';
	import { library } from '$lib/stores/library.svelte.js';
	import { sync } from '$lib/stores/sync.svelte.js';
	import { ui } from '$lib/stores/ui.svelte.js';

	let { book }: { book: Book } = $props();

	let confirming = $state<'delete' | 'backup' | null>(null);
	let menuOpen = $state(false);

	const cover = $derived(library.coverUrls[book.sha256]);
	const pct = $derived(library.progressBySha[book.sha256]);
	const missing = $derived(library.missingFiles[book.sha256] ?? false);
	const backedUp = $derived(Boolean(book.blossom?.servers.length));
	const busy = $derived(sync.isBusy(book.sha256));
</script>

<div class="group relative">
	<button
		class="block w-full overflow-hidden rounded-lg border border-zinc-200 bg-white text-left shadow-sm transition hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
		onclick={() => void library.open(book.sha256)}
	>
		<div class="relative aspect-2/3 bg-zinc-100 dark:bg-zinc-800">
			{#if cover}
				<img src={cover} alt="" class="h-full w-full object-cover" />
			{:else}
				<div class="flex h-full items-center justify-center p-3 text-center">
					<span class="text-sm font-medium text-zinc-400">{book.title}</span>
				</div>
			{/if}
			{#if pct !== undefined && pct > 0}
				<span
					class="absolute right-1.5 bottom-1.5 rounded bg-zinc-950/70 px-1.5 py-0.5 text-xs font-medium text-white"
				>
					{Math.round(pct * 100)}%
				</span>
			{/if}
			{#if missing}
				<div
					class="absolute inset-0 flex items-center justify-center bg-zinc-950/60 text-xs font-medium text-white"
				>
					Not on this device
				</div>
			{/if}
		</div>
		<div class="p-2.5">
			<div class="truncate text-sm font-medium" title={book.title}>{book.title}</div>
			<div class="truncate text-xs text-zinc-500">{book.creator}</div>
		</div>
	</button>

	<!-- One entry point for card actions, mouse and touch alike: always visible
	     on coarse pointers (no hover to reveal it), hover/focus-revealed on fine
	     pointers to keep the grid quiet. -->
	<button
		class="absolute top-1.5 right-1.5 z-10 rounded bg-zinc-950/60 p-1.5 text-zinc-200 transition-opacity hover:text-white pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-visible:opacity-100 {menuOpen || busy
			? 'pointer-fine:opacity-100'
			: ''}"
		title="Book actions"
		onclick={(e) => {
			e.stopPropagation();
			menuOpen = !menuOpen;
		}}
	>
		{#if busy}
			<Loader2 class="size-3.5 animate-spin" />
		{:else}
			<Ellipsis class="size-3.5" />
		{/if}
	</button>

	{#if menuOpen}
		<div
			class="fixed inset-0 z-20"
			role="presentation"
			onmousedown={() => (menuOpen = false)}
		></div>
		<div
			class="absolute top-8 right-1.5 z-30 w-40 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
			role="menu"
		>
			<button
				class="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
				role="menuitem"
				onclick={() => {
					menuOpen = false;
					ui.infoSha = book.sha256;
				}}
			>
				<Info class="size-3.5 text-zinc-500" /> Info
			</button>
			{#if !busy}
				{#if missing}
					<button
						class="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
						role="menuitem"
						onclick={() => {
							menuOpen = false;
							void sync.restoreBook(book.sha256);
						}}
					>
						<CloudDownload class="size-3.5 text-zinc-500" /> Restore file
					</button>
				{:else}
					<button
						class="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
						role="menuitem"
						onclick={() => {
							menuOpen = false;
							confirming = 'backup';
						}}
					>
						<CloudUpload class="size-3.5 {backedUp ? 'text-emerald-500' : 'text-zinc-500'}" />
						{backedUp ? 'Back up again' : 'Back up file'}
					</button>
				{/if}
			{/if}
			<button
				class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-red-600 hover:bg-zinc-100 dark:text-red-400 dark:hover:bg-zinc-800"
				role="menuitem"
				onclick={() => {
					menuOpen = false;
					confirming = 'delete';
				}}
			>
				<Trash2 class="size-3.5" /> Delete
			</button>
		</div>
	{/if}

	{#if confirming === 'delete'}
		<div
			class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg bg-zinc-950/85 p-3 text-center"
		>
			<p class="text-xs text-zinc-200">
				Delete “{book.title}” and all its annotations from this device?
			</p>
			<div class="flex gap-2">
				<button
					class="rounded bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-500"
					onclick={() => void library.deleteBook(book.sha256).then(() => (confirming = null))}
				>
					Delete
				</button>
				<button
					class="rounded bg-zinc-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-600"
					onclick={() => (confirming = null)}
				>
					Cancel
				</button>
			</div>
		</div>
	{:else if confirming === 'backup'}
		<div
			class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg bg-zinc-950/90 p-3 text-center"
		>
			<p class="text-xs text-zinc-200">
				Back up this file to your Blossom servers? Blobs are <strong>publicly fetchable</strong> by
				anyone who knows the file's hash — only back up books you have the right to share.
			</p>
			<div class="flex gap-2">
				<button
					class="rounded bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-500"
					onclick={() => {
						confirming = null;
						void sync.backupBook(book.sha256);
					}}
				>
					Back up
				</button>
				<button
					class="rounded bg-zinc-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-600"
					onclick={() => (confirming = null)}
				>
					Cancel
				</button>
			</div>
		</div>
	{/if}
</div>
