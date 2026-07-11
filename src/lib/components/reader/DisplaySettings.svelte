<script lang="ts">
	import type { ReadingSettings } from '$lib/epub/service.js';
	import { reader } from '$lib/stores/reader.svelte.js';
	import { settingsStore } from '$lib/stores/settings.svelte.js';

	let { onclose }: { onclose: () => void } = $props();

	const THEMES: ReadingSettings['theme'][] = ['light', 'sepia', 'dark'];
	const FONTS = [
		{ label: 'Publisher', value: '' },
		{ label: 'Serif', value: 'Georgia, serif' },
		{ label: 'Sans', value: 'system-ui, sans-serif' }
	];

	function apply(patch: Partial<ReadingSettings>) {
		settingsStore.save({ reading: { ...settingsStore.settings.reading, ...patch } });
		reader.applyDisplaySettings(settingsStore.settings.reading);
	}
</script>

<div class="fixed inset-0 z-40" role="presentation" onmousedown={onclose}></div>

<div
	class="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-zinc-200 bg-white p-3 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
	role="dialog"
	aria-label="Display settings"
>
	<div class="mb-3">
		<span class="mb-1 block text-xs font-medium text-zinc-500">Reading theme</span>
		<div class="flex gap-1.5">
			{#each THEMES as theme (theme)}
				<button
					class="flex-1 rounded-lg border py-1.5 text-xs capitalize {settingsStore.settings.reading
						.theme === theme
						? 'border-amber-500 font-medium text-amber-600 dark:text-amber-500'
						: 'border-zinc-200 dark:border-zinc-700'}"
					onclick={() => apply({ theme })}
				>
					{theme}
				</button>
			{/each}
		</div>
	</div>

	<div class="mb-3">
		<span class="mb-1 block text-xs font-medium text-zinc-500">
			Font size — {settingsStore.settings.reading.fontSize}px
		</span>
		<input
			type="range"
			min="12"
			max="28"
			step="1"
			class="w-full accent-amber-500"
			value={settingsStore.settings.reading.fontSize}
			oninput={(e) => apply({ fontSize: Number(e.currentTarget.value) })}
		/>
	</div>

	<div class="mb-3">
		<span class="mb-1 block text-xs font-medium text-zinc-500">
			Line height — {settingsStore.settings.reading.lineHeight}
		</span>
		<input
			type="range"
			min="1.2"
			max="2.2"
			step="0.1"
			class="w-full accent-amber-500"
			value={settingsStore.settings.reading.lineHeight}
			oninput={(e) => apply({ lineHeight: Number(e.currentTarget.value) })}
		/>
	</div>

	<div>
		<span class="mb-1 block text-xs font-medium text-zinc-500">Font</span>
		<div class="flex gap-1.5">
			{#each FONTS as font (font.value)}
				<button
					class="flex-1 rounded-lg border py-1.5 text-xs {settingsStore.settings.reading
						.fontFamily === font.value
						? 'border-amber-500 font-medium text-amber-600 dark:text-amber-500'
						: 'border-zinc-200 dark:border-zinc-700'}"
					onclick={() => apply({ fontFamily: font.value })}
				>
					{font.label}
				</button>
			{/each}
		</div>
	</div>
</div>
