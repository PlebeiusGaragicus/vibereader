<script lang="ts">
	import { BookOpen } from '@lucide/svelte';
	import { library } from '$lib/stores/library.svelte.js';
	import { ui } from '$lib/stores/ui.svelte.js';
	import BookCard from './BookCard.svelte';
	import BookInfoDialog from './BookInfoDialog.svelte';
	import ImportButton from './ImportButton.svelte';

	let dragging = $state(false);

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		const files = e.dataTransfer?.files;
		if (files?.length) void library.importFiles(files);
	}
</script>

<div
	class="h-full overflow-y-auto p-6 {dragging ? 'bg-amber-500/5 outline-2 outline-dashed outline-amber-500' : ''}"
	role="region"
	aria-label="Library"
	ondragover={(e) => {
		e.preventDefault();
		dragging = true;
	}}
	ondragleave={() => (dragging = false)}
	ondrop={onDrop}
>
	<div class="mb-6 flex items-center justify-between">
		<h2 class="text-xl font-semibold">Library</h2>
		<ImportButton />
	</div>

	{#if library.books.length === 0}
		<div class="flex flex-col items-center justify-center gap-3 py-24 text-center">
			<BookOpen class="size-12 text-zinc-300 dark:text-zinc-700" />
			<h3 class="text-lg font-medium">Your library is empty</h3>
			<p class="max-w-md text-sm text-zinc-500">
				Import an EPUB (or drop one anywhere on this page). Books are stored in this browser,
				under your nostr identity.
			</p>
		</div>
	{:else}
		<div class="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-5">
			{#each library.books as book (book.sha256)}
				<BookCard {book} />
			{/each}
		</div>
	{/if}
</div>

{#if ui.infoSha}
	<BookInfoDialog sha256={ui.infoSha} />
{/if}
