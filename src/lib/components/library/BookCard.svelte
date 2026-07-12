<script lang="ts">
	import { BookOpen, CloudDownload, CloudUpload, Loader2, Trash2 } from '@lucide/svelte';
	import type { Book } from '$lib/db/types.js';
	import { library } from '$lib/stores/library.svelte.js';
	import { sync } from '$lib/stores/sync.svelte.js';

	let { book }: { book: Book } = $props();

	let confirming = $state<'delete' | 'backup' | null>(null);

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
	{:else}
		<div class="absolute top-1.5 right-1.5 z-10 hidden gap-1 group-hover:flex">
			{#if busy}
				<span class="rounded bg-zinc-950/60 p-1.5 text-zinc-200">
					<Loader2 class="size-3.5 animate-spin" />
				</span>
			{:else if missing}
				<button
					class="rounded bg-zinc-950/60 p-1.5 text-zinc-200 hover:text-white"
					title="Restore file from Blossom"
					onclick={(e) => {
						e.stopPropagation();
						void sync.restoreBook(book.sha256);
					}}
				>
					<CloudDownload class="size-3.5" />
				</button>
			{:else}
				<button
					class="rounded bg-zinc-950/60 p-1.5 {backedUp
						? 'text-emerald-400'
						: 'text-zinc-200 hover:text-white'}"
					title={backedUp ? `Backed up (${book.blossom?.servers.length})` : 'Back up file to Blossom'}
					onclick={(e) => {
						e.stopPropagation();
						if (!backedUp) confirming = 'backup';
					}}
				>
					<CloudUpload class="size-3.5" />
				</button>
			{/if}
			<button
				class="rounded bg-zinc-950/60 p-1.5 text-zinc-200 hover:text-white"
				title="Delete book"
				onclick={(e) => {
					e.stopPropagation();
					confirming = 'delete';
				}}
			>
				<Trash2 class="size-3.5" />
			</button>
		</div>
	{/if}
</div>
