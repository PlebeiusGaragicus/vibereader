<script lang="ts">
	import { BookOpen, Trash2 } from '@lucide/svelte';
	import type { Book } from '$lib/db/types.js';
	import { library } from '$lib/stores/library.svelte.js';

	let { book }: { book: Book } = $props();

	let confirming = $state(false);

	const cover = $derived(library.coverUrls[book.sha256]);
	const pct = $derived(library.progressBySha[book.sha256]);
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
		</div>
		<div class="p-2.5">
			<div class="truncate text-sm font-medium" title={book.title}>{book.title}</div>
			<div class="truncate text-xs text-zinc-500">{book.creator}</div>
		</div>
	</button>

	{#if confirming}
		<div
			class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg bg-zinc-950/85 p-3 text-center"
		>
			<p class="text-xs text-zinc-200">
				Delete “{book.title}” and all its annotations from this device?
			</p>
			<div class="flex gap-2">
				<button
					class="rounded bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-500"
					onclick={() => void library.deleteBook(book.sha256)}
				>
					Delete
				</button>
				<button
					class="rounded bg-zinc-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-600"
					onclick={() => (confirming = false)}
				>
					Cancel
				</button>
			</div>
		</div>
	{:else}
		<button
			class="absolute top-1.5 right-1.5 z-10 hidden rounded bg-zinc-950/60 p-1.5 text-zinc-200 group-hover:block hover:text-white"
			title="Delete book"
			onclick={(e) => {
				e.stopPropagation();
				confirming = true;
			}}
		>
			<Trash2 class="size-3.5" />
		</button>
	{/if}
</div>
