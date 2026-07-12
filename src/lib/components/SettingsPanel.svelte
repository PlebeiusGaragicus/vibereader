<script lang="ts">
	import { X } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { settingsStore } from '$lib/stores/settings.svelte.js';
	import { ui } from '$lib/stores/ui.svelte.js';

	// Local draft so typing doesn't half-apply; saved on submit.
	let draft = $state({ ...settingsStore.settings.ai });
	let relaysDraft = $state(settingsStore.settings.relays.join('\n'));
	let blossomDraft = $state(settingsStore.settings.blossomServers.join('\n'));

	function parseList(text: string, prefix: RegExp): string[] {
		return text
			.split('\n')
			.map((line) => line.trim().replace(/\/$/, ''))
			.filter((line) => prefix.test(line));
	}

	function save() {
		settingsStore.save({
			ai: { ...draft },
			relays: parseList(relaysDraft, /^wss?:\/\//),
			blossomServers: parseList(blossomDraft, /^https?:\/\//)
		});
		toast.success('Settings saved');
		ui.settingsOpen = false;
	}
</script>

<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4"
	role="presentation"
	onmousedown={(e) => {
		if (e.target === e.currentTarget) ui.settingsOpen = false;
	}}
>
	<div
		class="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
		role="dialog"
		aria-label="Settings"
	>
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-lg font-semibold">Settings</h2>
			<button
				class="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
				title="Close"
				onclick={() => (ui.settingsOpen = false)}
			>
				<X class="size-4" />
			</button>
		</div>

		<h3 class="mb-1 text-sm font-medium">AI endpoint</h3>
		<p class="mb-3 text-xs text-zinc-500">
			Any OpenAI-compatible server that allows browser (CORS) requests: LM Studio or Ollama on
			localhost, OpenRouter, Anthropic, or your own gateway. Config and keys stay in this browser —
			they are never synced.
		</p>

		<label class="mb-2 block">
			<span class="mb-1 block text-xs font-medium text-zinc-500">Base URL</span>
			<input
				class="w-full rounded-lg border border-zinc-200 bg-transparent px-2.5 py-1.5 text-sm focus:outline-none dark:border-zinc-700"
				placeholder="http://localhost:1234/v1"
				bind:value={draft.baseUrl}
			/>
		</label>
		<label class="mb-2 block">
			<span class="mb-1 block text-xs font-medium text-zinc-500">Model</span>
			<input
				class="w-full rounded-lg border border-zinc-200 bg-transparent px-2.5 py-1.5 text-sm focus:outline-none dark:border-zinc-700"
				placeholder="e.g. qwen2.5-14b-instruct"
				bind:value={draft.model}
			/>
		</label>
		<label class="mb-2 block">
			<span class="mb-1 block text-xs font-medium text-zinc-500">API key (optional)</span>
			<input
				type="password"
				class="w-full rounded-lg border border-zinc-200 bg-transparent px-2.5 py-1.5 text-sm focus:outline-none dark:border-zinc-700"
				placeholder="sk-…"
				bind:value={draft.apiKey}
			/>
		</label>
		<label class="mb-4 flex items-center gap-2 text-sm">
			<input type="checkbox" class="accent-amber-500" bind:checked={draft.streaming} />
			Stream responses
		</label>

		<h3 class="mb-1 text-sm font-medium">Sync</h3>
		<p class="mb-3 text-xs text-zinc-500">
			Relays hold your (encrypted) library state; Blossom servers hold backed-up book files.
			Nothing is published without an explicit Sync / Back up / Share action.
		</p>
		<label class="mb-2 block">
			<span class="mb-1 block text-xs font-medium text-zinc-500">Relays (one per line)</span>
			<textarea
				class="w-full resize-none rounded-lg border border-zinc-200 bg-transparent px-2.5 py-1.5 font-mono text-xs focus:outline-none dark:border-zinc-700"
				rows="2"
				bind:value={relaysDraft}
			></textarea>
		</label>
		<label class="mb-4 block">
			<span class="mb-1 block text-xs font-medium text-zinc-500">Blossom servers (one per line)</span>
			<textarea
				class="w-full resize-none rounded-lg border border-zinc-200 bg-transparent px-2.5 py-1.5 font-mono text-xs focus:outline-none dark:border-zinc-700"
				rows="2"
				bind:value={blossomDraft}
			></textarea>
		</label>

		<button
			class="w-full rounded-lg bg-amber-600 py-2 text-sm font-medium text-white hover:bg-amber-700 dark:bg-amber-500 dark:text-zinc-950 dark:hover:bg-amber-400"
			onclick={save}
		>
			Save
		</button>
	</div>
</div>
