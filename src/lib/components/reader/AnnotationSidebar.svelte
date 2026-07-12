<script lang="ts">
	import { Globe, StickyNote } from '@lucide/svelte';
	import { HIGHLIGHT_COLORS } from '$lib/epub/service.js';
	import { annotations } from '$lib/stores/annotations.svelte.js';
	import { selection } from '$lib/stores/selection.svelte.js';

	let sharingId = $state<string | null>(null);
	let exportHighlight = $state(false);
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
				<div
					class="group rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-800 dark:hover:border-zinc-700 hover:border-zinc-300"
				>
					<button
						class="w-full text-left"
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

					{#if sharingId === anno.id}
						<div class="mt-2 rounded-lg bg-zinc-100 p-2 text-xs dark:bg-zinc-800">
							<p class="mb-1.5">
								Publish this annotation <strong>in plaintext</strong> to your relays? It stays
								editable, and you can make it private again later.
							</p>
							<label class="mb-2 flex items-center gap-1.5">
								<input type="checkbox" class="accent-amber-500" bind:checked={exportHighlight} />
								Also publish as a NIP-84 highlight (Highlighter-compatible, immutable)
							</label>
							<div class="flex gap-2">
								<button
									class="rounded bg-amber-600 px-2 py-1 font-medium text-white hover:bg-amber-500"
									onclick={() => {
										void annotations.setShared(anno.id, true, exportHighlight);
										sharingId = null;
									}}
								>
									Publish
								</button>
								<button
									class="rounded bg-zinc-300 px-2 py-1 dark:bg-zinc-700"
									onclick={() => (sharingId = null)}
								>
									Cancel
								</button>
							</div>
						</div>
					{:else}
						<div class="mt-1 flex justify-end">
							<button
								class="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs {anno.shared
									? 'text-emerald-500'
									: 'hidden text-zinc-400 group-hover:flex hover:text-zinc-600 dark:hover:text-zinc-300'}"
								title={anno.shared ? 'Public — click to make private' : 'Share publicly'}
								onclick={() => {
									if (anno.shared) void annotations.setShared(anno.id, false);
									else {
										exportHighlight = false;
										sharingId = anno.id;
									}
								}}
							>
								<Globe class="size-3" />
								{anno.shared ? 'Public' : 'Share'}
							</button>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</aside>
