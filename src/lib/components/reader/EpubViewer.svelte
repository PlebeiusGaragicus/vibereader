<script lang="ts">
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';
	import { reader } from '$lib/stores/reader.svelte.js';
	import { selection } from '$lib/stores/selection.svelte.js';
	import ContextMenu from './ContextMenu.svelte';

	let container: HTMLElement | undefined = $state();
	let attached = false;

	$effect(() => {
		if (container && reader.bookReady && !attached) {
			attached = true;
			void reader.attach(container);
		}
	});

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowRight') reader.next();
		else if (e.key === 'ArrowLeft') reader.prev();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="relative h-full">
	<div bind:this={container} class="h-full"></div>

	<!-- Edge click zones (under the iframe's own text area, over the margins) -->
	<button
		class="absolute inset-y-0 left-0 w-10 text-zinc-300 opacity-0 transition hover:opacity-100 dark:text-zinc-600"
		aria-label="Previous page"
		onclick={() => reader.prev()}
	>
		<ChevronLeft class="mx-auto size-6" />
	</button>
	<button
		class="absolute inset-y-0 right-0 w-10 text-zinc-300 opacity-0 transition hover:opacity-100 dark:text-zinc-600"
		aria-label="Next page"
		onclick={() => reader.next()}
	>
		<ChevronRight class="mx-auto size-6" />
	</button>

	{#if selection.active || selection.editingId}
		<ContextMenu />
	{/if}
</div>
