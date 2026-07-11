// Chat threads for the open book. Device-local by design — transcripts are
// deliberately outside the sync schema (docs/nostr-event-model.md).

import { nanoid } from 'nanoid';
import { toast } from 'svelte-sonner';
import { AiError, chatCompletion, type AiMessage } from '$lib/ai/client.js';
import { buildSystemPrompt } from '$lib/ai/prompt.js';
import { db } from '$lib/db/index.js';
import type { Book, ChatThread } from '$lib/db/types.js';
import { settingsStore } from './settings.svelte.js';
import { ui } from './ui.svelte.js';

let threads = $state<ChatThread[]>([]);
let activeId = $state<string | null>(null);
let streamingText = $state('');
let busy = $state(false);
let book: Book | null = null;
let abort: AbortController | null = null;

const sorted = $derived([...threads].sort((a, b) => b.updatedAt - a.updatedAt));
const active = $derived(threads.find((t) => t.id === activeId) ?? null);

async function load(forBook: Book): Promise<void> {
	book = forBook;
	threads = await db.chats.getByBook(forBook.sha256);
	activeId = null;
}

function startFromSelection(context: { cfiRange: string; quote: string }): void {
	if (!book) return;
	const now = Date.now();
	const thread: ChatThread = {
		id: `chat-${nanoid()}`,
		sha256: book.sha256,
		title: context.quote.slice(0, 60),
		context,
		messages: [],
		createdAt: now,
		updatedAt: now
	};
	threads.push(thread);
	activeId = thread.id;
	ui.chatOpen = true;
}

function startGeneral(): void {
	if (!book) return;
	const now = Date.now();
	const thread: ChatThread = {
		id: `chat-${nanoid()}`,
		sha256: book.sha256,
		title: 'About this book',
		messages: [],
		createdAt: now,
		updatedAt: now
	};
	threads.push(thread);
	activeId = thread.id;
}

async function send(text: string): Promise<void> {
	const thread = active;
	if (!thread || !book || busy) return;
	const content = text.trim();
	if (!content) return;

	thread.messages.push({ role: 'user', content, createdAt: Date.now() });
	thread.updatedAt = Date.now();
	busy = true;
	streamingText = '';
	abort = new AbortController();

	const messages: AiMessage[] = [
		{ role: 'system', content: buildSystemPrompt(book, thread.context) },
		...thread.messages.map((m) => ({ role: m.role, content: m.content }))
	];

	try {
		const reply = await chatCompletion({
			settings: settingsStore.settings.ai,
			messages,
			signal: abort.signal,
			onDelta: (delta) => (streamingText += delta)
		});
		thread.messages.push({ role: 'assistant', content: reply, createdAt: Date.now() });
		thread.updatedAt = Date.now();
	} catch (err) {
		if (abort.signal.aborted) {
			// Keep whatever streamed in before the user hit stop.
			if (streamingText) {
				thread.messages.push({ role: 'assistant', content: streamingText, createdAt: Date.now() });
			}
		} else {
			toast.error(err instanceof AiError ? err.message : 'AI request failed');
		}
	} finally {
		busy = false;
		streamingText = '';
		abort = null;
		await db.chats.save($state.snapshot(thread) as ChatThread);
	}
}

function stop(): void {
	abort?.abort();
}

async function removeThread(id: string): Promise<void> {
	threads = threads.filter((t) => t.id !== id);
	if (activeId === id) activeId = null;
	await db.chats.delete(id);
}

function reset(): void {
	abort?.abort();
	threads = [];
	activeId = null;
	streamingText = '';
	busy = false;
	book = null;
}

export const chat = {
	get threads() {
		return sorted;
	},
	get active() {
		return active;
	},
	get streamingText() {
		return streamingText;
	},
	get busy() {
		return busy;
	},
	set activeId(id: string | null) {
		activeId = id;
	},
	load,
	startFromSelection,
	startGeneral,
	send,
	stop,
	removeThread,
	reset
};
