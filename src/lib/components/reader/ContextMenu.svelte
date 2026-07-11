<script lang="ts">
	import { Copy, Trash2 } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import type { HighlightColor } from '$lib/db/types.js';
	import { HIGHLIGHT_COLORS, clearSelection } from '$lib/epub/service.js';
	import { annotations } from '$lib/stores/annotations.svelte.js';
	import { selection } from '$lib/stores/selection.svelte.js';

	const COLORS = Object.keys(HIGHLIGHT_COLORS) as HighlightColor[];

	let menu: HTMLElement | undefined = $state();
	let noteDraft = $state('');
	let noteOpen = $state(false);

	const editing = $derived(selection.editingId ? annotations.byId(selection.editingId) : undefined);
	const anchor = $derived(selection.active?.rect ?? selection.editingRect);

	// Seed the note editor when editing an existing annotation.
	$effect(() => {
		noteDraft = editing?.note ?? '';
		noteOpen = Boolean(editing?.note);
	});

	// Clamp the menu into the viewport, below (or above) the anchor.
	const style = $derived.by(() => {
		const width = 272;
		if (!anchor) return `left: 50%; top: 20%; transform: translateX(-50%); width: ${width}px;`;
		const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
		const below = anchor.bottom + 8;
		const top = below + 200 > window.innerHeight ? Math.max(8, anchor.top - 208) : below;
		return `left: ${left}px; top: ${top}px; width: ${width}px;`;
	});

	function close() {
		clearSelection();
		selection.clear();
	}

	async function pickColor(color: HighlightColor) {
		if (editing) {
			await annotations.update(editing.id, { color: editing.color === color ? undefined : color });
			close();
			return;
		}
		const sel = selection.active;
		if (!sel) return;
		await annotations.create({
			cfiRange: sel.cfiRange,
			quote: sel.text,
			color,
			note: noteDraft.trim() || undefined
		});
		close();
	}

	async function saveNote() {
		const note = noteDraft.trim() || undefined;
		if (editing) {
			await annotations.update(editing.id, { note });
		} else if (selection.active) {
			const sel = selection.active;
			await annotations.create({ cfiRange: sel.cfiRange, quote: sel.text, note });
		}
		close();
	}

	async function copyText() {
		const text = editing?.quote ?? selection.active?.text;
		if (text) {
			await navigator.clipboard.writeText(text);
			toast.success('Copied');
		}
		close();
	}
</script>

<!-- Backdrop: any click outside the menu dismisses it. -->
<div class="fixed inset-0 z-40" role="presentation" onmousedown={close}></div>

<div
	bind:this={menu}
	{style}
	class="fixed z-50 rounded-xl border border-zinc-200 bg-white p-3 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
	role="dialog"
	aria-label="Annotation menu"
>
	<div class="mb-2 flex items-center justify-between gap-2">
		<div class="flex gap-1.5">
			{#each COLORS as color (color)}
				<button
					class="size-6 rounded-full border-2 transition hover:scale-110 {editing?.color === color
						? 'border-zinc-900 dark:border-zinc-100'
						: 'border-transparent'}"
					style="background: {HIGHLIGHT_COLORS[color]}"
					title="Highlight {color}"
					aria-label="Highlight {color}"
					onclick={() => void pickColor(color)}
				></button>
			{/each}
		</div>
		<div class="flex gap-1">
			<button
				class="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
				title="Copy text"
				onclick={() => void copyText()}
			>
				<Copy class="size-4" />
			</button>
			{#if editing}
				<button
					class="rounded p-1.5 text-red-500 hover:bg-red-500/10"
					title="Delete annotation"
					onclick={() => {
						void annotations.remove(editing.id);
						close();
					}}
				>
					<Trash2 class="size-4" />
				</button>
			{/if}
		</div>
	</div>

	{#if noteOpen}
		<textarea
			class="mb-2 w-full resize-none rounded-lg border border-zinc-200 bg-transparent p-2 text-sm focus:outline-none dark:border-zinc-700"
			rows="3"
			placeholder="Write a note…"
			bind:value={noteDraft}
		></textarea>
		<button
			class="w-full rounded-lg bg-amber-600 py-1.5 text-sm font-medium text-white hover:bg-amber-700 dark:bg-amber-500 dark:text-zinc-950 dark:hover:bg-amber-400"
			onclick={() => void saveNote()}
		>
			Save note
		</button>
	{:else}
		<button
			class="w-full rounded-lg border border-zinc-200 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
			onclick={() => (noteOpen = true)}
		>
			{editing ? 'Add a note' : 'Note only (no highlight)'}
		</button>
	{/if}
</div>
