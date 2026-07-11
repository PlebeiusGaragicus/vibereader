<script lang="ts">
	import { Loader2, Plus } from '@lucide/svelte';
	import { library } from '$lib/stores/library.svelte.js';

	let input: HTMLInputElement | undefined = $state();
</script>

<input
	bind:this={input}
	type="file"
	accept=".epub,application/epub+zip"
	multiple
	class="hidden"
	onchange={(e) => {
		const files = e.currentTarget.files;
		if (files?.length) void library.importFiles(files);
		e.currentTarget.value = '';
	}}
/>

<button
	class="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 dark:bg-amber-500 dark:text-zinc-950 dark:hover:bg-amber-400"
	disabled={library.importing}
	onclick={() => input?.click()}
>
	{#if library.importing}
		<Loader2 class="size-4 animate-spin" /> Importing…
	{:else}
		<Plus class="size-4" /> Import EPUB
	{/if}
</button>
