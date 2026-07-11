<script lang="ts">
	import { StickyNote } from '@lucide/svelte';
	import { HIGHLIGHT_COLORS } from '$lib/epub/service.js';
	import { annotations } from '$lib/stores/annotations.svelte.js';
	import { selection } from '$lib/stores/selection.svelte.js';
</script>

<aside
	class="w-72 shrink-0 overflow-y-auto border-l border-zinc-200 p-3 dark:border-zinc-800"
	aria-label="Annotations"
>
	<h3 class="mb-2 text-sm font-semibold text-zinc-500">
		Annotations ({annotations.all.length})
	</h3>

	{#if annotations.all.length === 0}
		<p class="py-8 text-center text-sm text-zinc-500">
			Select text in the book to highlight it or attach a note.
		</p>
	{:else}
		<div class="flex flex-col gap-2">
			{#each annotations.all as anno (anno.id)}
				<button
					class="rounded-lg border border-zinc-200 p-2.5 text-left hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700"
					onclick={() => {
						void annotations.goTo(anno.id).then(() => selection.edit(anno.id, null));
					}}
				>
					<div class="flex items-start gap-2">
						{#if anno.color}
							<span
								class="mt-1 size-3 shrink-0 rounded-full"
								style="background: {HIGHLIGHT_COLORS[anno.color]}"
							></span>
						{:else}
							<StickyNote class="mt-0.5 size-3.5 shrink-0 text-red-500" />
						{/if}
						<div class="min-w-0">
							<p class="line-clamp-3 text-sm text-zinc-700 dark:text-zinc-300">“{anno.quote}”</p>
							{#if anno.note}
								<p class="mt-1 line-clamp-2 text-xs text-zinc-500">{anno.note}</p>
							{/if}
						</div>
					</div>
				</button>
			{/each}
		</div>
	{/if}
</aside>
