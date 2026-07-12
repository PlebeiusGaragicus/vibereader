<script lang="ts">
	// Ghost book: metadata + annotations are on this device, the file isn't.
	// Read-only — highlights and notes stay readable without the bytes;
	// restoring upgrades in place to the real reader.
	import { ArrowLeft, CloudDownload, Globe, Loader2, StickyNote } from '@lucide/svelte';
	import type { Annotation } from '$lib/db/types.js';
	import { db } from '$lib/db/index.js';
	import { compareCfi, HIGHLIGHT_COLORS } from '$lib/epub/service.js';
	import { library } from '$lib/stores/library.svelte.js';
	import { sync } from '$lib/stores/sync.svelte.js';
	import { ui } from '$lib/stores/ui.svelte.js';

	let { sha256 }: { sha256: string } = $props();

	const book = $derived(library.books.find((b) => b.sha256 === sha256));
	const cover = $derived(library.coverUrls[sha256]);
	const missing = $derived(library.missingFiles[sha256] ?? false);
	const busy = $derived(sync.isBusy(sha256));

	let items = $state<Annotation[]>([]);
	const sorted = $derived([...items].sort((a, b) => compareCfi(a.cfiRange, b.cfiRange)));

	$effect(() => {
		void db.annotations.getByBook(sha256).then((list) => (items = list));
	});

	function back(): void {
		ui.ghostSha = null;
		ui.view = 'library';
	}

	async function restoreAndOpen(): Promise<void> {
		await sync.restoreBook(sha256);
		// restoreBook refreshed the library; if the file landed, open for real.
		if (!library.missingFiles[sha256]) {
			ui.ghostSha = null;
			void library.open(sha256);
		}
	}
</script>

<div class="flex h-full flex-col">
	<div class="flex items-center gap-2 border-b border-zinc-200 px-3 py-1.5 dark:border-zinc-800">
		<button
			class="rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
			title="Back to library"
			onclick={back}
		>
			<ArrowLeft class="size-4" />
		</button>
		<div class="min-w-0 flex-1 text-center">
			<span class="truncate text-sm font-medium">{book?.title}</span>
		</div>
		<span class="w-6"></span>
	</div>

	<div class="min-h-0 flex-1 overflow-y-auto">
		<div class="mx-auto max-w-2xl p-6">
			<div class="mb-6 flex gap-4">
				{#if cover}
					<img src={cover} alt="" class="h-32 w-22 shrink-0 rounded object-cover shadow" />
				{/if}
				<div class="min-w-0">
					<h2 class="text-lg leading-tight font-semibold">{book?.title}</h2>
					<p class="text-sm text-zinc-500">{book?.creator}</p>
					<p class="mt-2 text-xs text-zinc-500">
						This book's file isn't on this device — your highlights and notes are still readable
						below.
					</p>
					{#if missing}
						<button
							class="mt-3 flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50"
							disabled={busy}
							onclick={() => void restoreAndOpen()}
						>
							{#if busy}
								<Loader2 class="size-3.5 animate-spin" />
							{:else}
								<CloudDownload class="size-3.5" />
							{/if}
							Restore file & open
						</button>
					{/if}
				</div>
			</div>

			<h3 class="mb-2 text-sm font-semibold text-zinc-500">
				Annotations ({sorted.length})
			</h3>
			{#if sorted.length === 0}
				<p class="py-8 text-center text-sm text-zinc-500">No annotations for this book yet.</p>
			{:else}
				<div class="flex flex-col gap-2">
					{#each sorted as anno (anno.id)}
						<div class="rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-800">
							<div class="flex items-start gap-2">
								{#if anno.color}
									<span
										class="mt-1 size-3 shrink-0 rounded-full"
										style="background: {HIGHLIGHT_COLORS[anno.color]}"
									></span>
								{:else}
									<StickyNote class="mt-0.5 size-3.5 shrink-0 text-red-500" />
								{/if}
								<div class="min-w-0 flex-1">
									<p class="text-sm text-zinc-700 dark:text-zinc-300">“{anno.quote}”</p>
									{#if anno.note}
										<p class="mt-1 text-xs text-zinc-500">{anno.note}</p>
									{/if}
								</div>
								{#if anno.shared}
									<span class="flex shrink-0 items-center gap-1 text-xs text-emerald-500">
										<Globe class="size-3" /> Public
									</span>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>
