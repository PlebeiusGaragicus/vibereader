<script lang="ts">
	import { reader } from '$lib/stores/reader.svelte.js';

	const currentHref = $derived(reader.location?.sectionHref?.split('#')[0]);
</script>

<nav
	class="w-64 shrink-0 overflow-y-auto border-r border-zinc-200 py-2 dark:border-zinc-800"
	aria-label="Table of contents"
>
	{#each reader.toc as entry (entry.href + entry.label)}
		<button
			class="block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 {currentHref ===
			entry.href.split('#')[0]
				? 'font-medium text-amber-600 dark:text-amber-500'
				: 'text-zinc-600 dark:text-zinc-400'}"
			style="padding-left: {0.75 + entry.depth * 0.9}rem"
			onclick={() => void reader.display(entry.href)}
		>
			{entry.label}
		</button>
	{/each}
</nav>
