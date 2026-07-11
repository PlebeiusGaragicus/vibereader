// Reading-companion system prompt. The selected passage travels in the
// system prompt so every turn of the thread keeps its context.

import type { Book, ChatThread } from '$lib/db/types.js';

export function buildSystemPrompt(book: Book, context?: ChatThread['context']): string {
	const lines = [
		`You are a thoughtful reading companion. The user is reading "${book.title}" by ${book.creator}.`,
		'Help them understand, question, and enjoy the text: explain passages, define terms in context, discuss themes, and answer questions.',
		'Be concise and conversational. Do not spoil parts of the book the user has not brought up.'
	];
	if (context) {
		lines.push(
			'',
			'The user selected this passage and wants to discuss it:',
			`"""${context.quote}"""`
		);
	}
	return lines.join('\n');
}
