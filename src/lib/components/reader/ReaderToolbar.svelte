<script lang="ts">
	import { ArrowLeft, Highlighter, List, MessageSquare, Type } from '@lucide/svelte';
	import { reader } from '$lib/stores/reader.svelte.js';
	import { ui } from '$lib/stores/ui.svelte.js';
	import DisplaySettings from './DisplaySettings.svelte';

	let displayOpen = $state(false);
</script>

<div
	class="flex items-center gap-2 border-b border-zinc-200 px-3 py-1.5 dark:border-zinc-800"
>
	<button
		class="rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
		title="Back to library"
		onclick={() => reader.close()}
	>
		<ArrowLeft class="size-4" />
	</button>
	<button
		class="rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 {ui.tocOpen
			? 'text-amber-600 dark:text-amber-500'
			: ''}"
		title="Table of contents"
		onclick={() => (ui.tocOpen = !ui.tocOpen)}
	>
		<List class="size-4" />
	</button>

	<div class="min-w-0 flex-1 text-center">
		<span class="truncate text-sm font-medium">{reader.book?.title}</span>
		{#if reader.location?.sectionLabel}
			<span class="hidden truncate text-sm text-zinc-500 sm:inline">
				— {reader.location.sectionLabel}</span
			>
		{/if}
	</div>

	<span class="w-12 text-right text-xs tabular-nums text-zinc-500">
		{reader.percentage !== undefined ? `${Math.round(reader.percentage * 100)}%` : '…'}
	</span>
	<div class="relative">
		<button
			class="rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 {displayOpen
				? 'text-amber-600 dark:text-amber-500'
				: ''}"
			title="Display settings"
			onclick={() => (displayOpen = !displayOpen)}
		>
			<Type class="size-4" />
		</button>
		{#if displayOpen}
			<DisplaySettings onclose={() => (displayOpen = false)} />
		{/if}
	</div>
	<button
		class="rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 {ui.annotationsOpen
			? 'text-amber-600 dark:text-amber-500'
			: ''}"
		title="Annotations"
		onclick={() => (ui.annotationsOpen = !ui.annotationsOpen)}
	>
		<Highlighter class="size-4" />
	</button>
	<button
		class="rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 {ui.chatOpen
			? 'text-amber-600 dark:text-amber-500'
			: ''}"
		title="Chat"
		onclick={() => (ui.chatOpen = !ui.chatOpen)}
	>
		<MessageSquare class="size-4" />
	</button>
</div>
