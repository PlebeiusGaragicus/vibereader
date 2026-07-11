<script lang="ts">
	import { ArrowLeft, MessageSquarePlus, Send, Square, Trash2 } from '@lucide/svelte';
	import { chat } from '$lib/stores/chat.svelte.js';
	import { settingsStore } from '$lib/stores/settings.svelte.js';
	import { ui } from '$lib/stores/ui.svelte.js';

	let draft = $state('');
	let scroller: HTMLElement | undefined = $state();

	// Keep the newest message in view while streaming.
	$effect(() => {
		void chat.streamingText;
		void chat.active?.messages.length;
		if (scroller) scroller.scrollTop = scroller.scrollHeight;
	});

	function submit() {
		const text = draft;
		draft = '';
		void chat.send(text);
	}
</script>

<aside
	class="flex w-80 shrink-0 flex-col border-l border-zinc-200 dark:border-zinc-800"
	aria-label="Chat"
>
	{#if !settingsStore.isAiConfigured}
		<div class="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
			<p class="text-sm text-zinc-500">
				No AI endpoint configured. Bring your own — a local LM Studio / Ollama, OpenRouter, or any
				OpenAI-compatible server that allows browser requests.
			</p>
			<button
				class="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 dark:bg-amber-500 dark:text-zinc-950 dark:hover:bg-amber-400"
				onclick={() => (ui.settingsOpen = true)}
			>
				Open Settings
			</button>
		</div>
	{:else if !chat.active}
		<div class="flex items-center justify-between border-b border-zinc-200 p-2.5 dark:border-zinc-800">
			<h3 class="text-sm font-semibold text-zinc-500">Chats</h3>
			<button
				class="flex items-center gap-1 rounded p-1.5 text-sm text-amber-600 hover:bg-zinc-100 dark:text-amber-500 dark:hover:bg-zinc-800"
				title="New chat about this book"
				onclick={() => chat.startGeneral()}
			>
				<MessageSquarePlus class="size-4" /> New
			</button>
		</div>
		<div class="flex-1 overflow-y-auto p-2">
			{#if chat.threads.length === 0}
				<p class="py-8 text-center text-sm text-zinc-500">
					Select text in the book and choose “Chat about this”, or start a general chat.
				</p>
			{:else}
				{#each chat.threads as thread (thread.id)}
					<div class="group flex items-start gap-1">
						<button
							class="min-w-0 flex-1 rounded-lg p-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
							onclick={() => (chat.activeId = thread.id)}
						>
							<div class="truncate text-sm">{thread.title}</div>
							{#if thread.context}
								<div class="truncate text-xs text-amber-600/80 dark:text-amber-500/80">
									“{thread.context.quote.slice(0, 50)}”
								</div>
							{/if}
							<div class="text-xs text-zinc-500">{thread.messages.length} messages</div>
						</button>
						<button
							class="mt-2 hidden rounded p-1 text-zinc-400 group-hover:block hover:text-red-500"
							title="Delete chat"
							onclick={() => void chat.removeThread(thread.id)}
						>
							<Trash2 class="size-3.5" />
						</button>
					</div>
				{/each}
			{/if}
		</div>
	{:else}
		<div class="flex items-center gap-2 border-b border-zinc-200 p-2.5 dark:border-zinc-800">
			<button
				class="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
				title="All chats"
				onclick={() => (chat.activeId = null)}
			>
				<ArrowLeft class="size-4" />
			</button>
			<div class="min-w-0 flex-1 truncate text-sm font-medium">{chat.active.title}</div>
		</div>
		{#if chat.active.context}
			<div
				class="border-b border-zinc-200 bg-amber-500/5 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400"
			>
				“{chat.active.context.quote.slice(0, 200)}”
			</div>
		{/if}
		<div bind:this={scroller} class="flex-1 overflow-y-auto p-3">
			{#each chat.active.messages as message, i (i)}
				<div class="mb-3 {message.role === 'user' ? 'text-right' : ''}">
					<div
						class="inline-block max-w-[90%] rounded-xl px-3 py-2 text-left text-sm whitespace-pre-wrap {message.role ===
						'user'
							? 'bg-amber-600/10 dark:bg-amber-500/15'
							: 'bg-zinc-100 dark:bg-zinc-800'}"
					>
						{message.content}
					</div>
				</div>
			{/each}
			{#if chat.busy}
				<div class="mb-3">
					<div
						class="inline-block max-w-[90%] rounded-xl bg-zinc-100 px-3 py-2 text-sm whitespace-pre-wrap dark:bg-zinc-800"
					>
						{chat.streamingText || '…'}
					</div>
				</div>
			{/if}
		</div>
		<div class="flex items-end gap-2 border-t border-zinc-200 p-2.5 dark:border-zinc-800">
			<textarea
				class="max-h-32 min-h-9 flex-1 resize-none rounded-lg border border-zinc-200 bg-transparent px-2.5 py-1.5 text-sm focus:outline-none dark:border-zinc-700"
				rows="1"
				placeholder="Ask about the book…"
				bind:value={draft}
				onkeydown={(e) => {
					if (e.key === 'Enter' && !e.shiftKey) {
						e.preventDefault();
						submit();
					}
				}}
			></textarea>
			{#if chat.busy}
				<button
					class="rounded-lg bg-zinc-200 p-2 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600"
					title="Stop"
					onclick={() => chat.stop()}
				>
					<Square class="size-4" />
				</button>
			{:else}
				<button
					class="rounded-lg bg-amber-600 p-2 text-white hover:bg-amber-700 disabled:opacity-40 dark:bg-amber-500 dark:text-zinc-950 dark:hover:bg-amber-400"
					title="Send"
					disabled={!draft.trim()}
					onclick={submit}
				>
					<Send class="size-4" />
				</button>
			{/if}
		</div>
	{/if}
</aside>
