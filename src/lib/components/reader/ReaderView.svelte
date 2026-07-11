<script lang="ts">
	import { reader } from '$lib/stores/reader.svelte.js';
	import { ui } from '$lib/stores/ui.svelte.js';
	import AnnotationSidebar from './AnnotationSidebar.svelte';
	import EpubViewer from './EpubViewer.svelte';
	import ReaderToolbar from './ReaderToolbar.svelte';
	import TocSidebar from './TocSidebar.svelte';
</script>

<div class="flex h-full flex-col">
	<ReaderToolbar />
	<div class="flex min-h-0 flex-1">
		{#if ui.tocOpen}
			<TocSidebar />
		{/if}
		<div class="min-w-0 flex-1">
			{#if reader.bookReady}
				<EpubViewer />
			{:else}
				<div class="flex h-full items-center justify-center text-sm text-zinc-500">
					Opening book…
				</div>
			{/if}
		</div>
		{#if ui.annotationsOpen}
			<AnnotationSidebar />
		{/if}
	</div>
</div>
