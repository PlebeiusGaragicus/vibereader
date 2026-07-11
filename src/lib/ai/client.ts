// Plain-fetch client for any OpenAI-compatible /chat/completions endpoint.
// Runs entirely in the browser — the endpoint must allow CORS (that's an
// acceptance criterion, not a bug). Streaming via SSE with a single-shot
// fallback for gateways that break browser streaming.

import type { AiSettings } from '$lib/stores/settings.svelte.js';

export interface AiMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export class AiError extends Error {}

// PAYMENTS: per-request seam. When bitcoin payments arrive (ecash attached to
// requests / a payment server that is just another OpenAI-compatible base URL
// accepting ecash), they hook in here. Deferred deliberately — do not build
// ahead of this seam.
async function beforeRequest(_settings: AiSettings): Promise<void> {}

export async function chatCompletion(options: {
	settings: AiSettings;
	messages: AiMessage[];
	signal?: AbortSignal;
	onDelta?: (text: string) => void;
}): Promise<string> {
	const { settings, messages, signal, onDelta } = options;
	if (!settings.baseUrl || !settings.model) {
		throw new AiError('No AI endpoint configured — set one in Settings.');
	}
	await beforeRequest(settings);

	const stream = settings.streaming && Boolean(onDelta);
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;

	let response: Response;
	try {
		response = await fetch(`${settings.baseUrl.replace(/\/$/, '')}/chat/completions`, {
			method: 'POST',
			headers,
			signal,
			body: JSON.stringify({ model: settings.model, messages, stream })
		});
	} catch (err) {
		if (signal?.aborted) throw err;
		throw new AiError(
			'Could not reach the AI endpoint. Check the base URL — and that the server allows browser (CORS) requests.'
		);
	}

	if (!response.ok) {
		const body = await response.text().catch(() => '');
		throw new AiError(`AI endpoint returned ${response.status}: ${body.slice(0, 300)}`);
	}

	if (!stream) {
		const data = (await response.json()) as {
			choices?: { message?: { content?: string } }[];
		};
		const content = data.choices?.[0]?.message?.content;
		if (typeof content !== 'string') throw new AiError('Unexpected response shape from endpoint.');
		return content;
	}

	// SSE stream: lines of `data: {...}` with `data: [DONE]` terminator.
	if (!response.body) throw new AiError('Endpoint did not return a stream body.');
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	let full = '';
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop() ?? '';
		for (const line of lines) {
			const data = line.replace(/^data:\s*/, '').trim();
			if (!data || !line.startsWith('data:')) continue;
			if (data === '[DONE]') return full;
			try {
				const chunk = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
				const delta = chunk.choices?.[0]?.delta?.content;
				if (delta) {
					full += delta;
					onDelta?.(delta);
				}
			} catch {
				// Ignore malformed keep-alives.
			}
		}
	}
	return full;
}
