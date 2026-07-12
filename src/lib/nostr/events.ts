// Codecs between local records and the nostr events defined in
// docs/nostr-event-model.md. Private events carry NIP-44-to-self ciphertext
// and no cleartext tags beyond `d`; a shared annotation is the SAME 30104
// republished in plaintext with query tags.

import { cyphertap, type SimpleNostrEvent } from 'cyphertap';
import type { Annotation, Book, ReadingProgress, Tombstone } from '$lib/db/types.js';
import type { ReadingSettings } from '$lib/epub/service.js';
import {
	KIND_ANNOTATION,
	KIND_BOOK,
	KIND_HIGHLIGHT,
	KIND_PROGRESS,
	KIND_SETTINGS,
	SETTINGS_D_TAG
} from './kinds.js';

export interface AddressableDraft {
	kind: number;
	d: string;
	content: string;
	tags: string[][];
	/** For merge ordering on the receiving side. */
	updatedAt: number;
}

interface Tombstoned {
	deleted: true;
	updatedAt: number;
}

function selfPubkey(): string {
	const hex = cyphertap.getUserHex();
	if (!hex) throw new Error('Not logged in');
	return hex;
}

async function sealed(payload: unknown): Promise<string> {
	return cyphertap.encrypt(JSON.stringify(payload), selfPubkey());
}

// ---- encode (local record → event draft) ----

export async function bookDraft(book: Book): Promise<AddressableDraft> {
	const { sha256, ...content } = book;
	void sha256;
	const payload = { ...content, lastOpenedAt: undefined };
	if (book.shared) {
		// Public shelf: plaintext + query tags; stays addressable and editable.
		return {
			kind: KIND_BOOK,
			d: book.sha256,
			content: JSON.stringify(payload),
			tags: isbnTags(book),
			updatedAt: book.updatedAt
		};
	}
	return {
		kind: KIND_BOOK,
		d: book.sha256,
		content: await sealed(payload),
		tags: [],
		updatedAt: book.updatedAt
	};
}

export async function progressDraft(progress: ReadingProgress): Promise<AddressableDraft> {
	const { sha256, ...content } = progress;
	void sha256;
	return {
		kind: KIND_PROGRESS,
		d: progress.sha256,
		content: await sealed(content),
		tags: [],
		updatedAt: progress.updatedAt
	};
}

export async function settingsDraft(
	reading: ReadingSettings,
	updatedAt: number
): Promise<AddressableDraft> {
	return {
		kind: KIND_SETTINGS,
		d: SETTINGS_D_TAG,
		content: await sealed({ reading, updatedAt }),
		tags: [],
		updatedAt
	};
}

export async function annotationDraft(anno: Annotation): Promise<AddressableDraft> {
	const { id, sha256, ...rest } = anno;
	void id;
	const payload = { book: sha256, ...rest };
	if (anno.shared) {
		// Plaintext + cleartext query tags; stays addressable and editable.
		return {
			kind: KIND_ANNOTATION,
			d: anno.id,
			content: JSON.stringify(payload),
			tags: [['x', sha256]],
			updatedAt: anno.updatedAt
		};
	}
	return {
		kind: KIND_ANNOTATION,
		d: anno.id,
		content: await sealed(payload),
		tags: [],
		updatedAt: anno.updatedAt
	};
}

/** ISBN query tags (NIP-73) for shared annotations, when the book has one. */
export function isbnTags(book: Book | undefined): string[][] {
	return book?.isbn ? [['i', `isbn:${book.isbn}`], ['k', 'isbn']] : [];
}

export async function tombstoneDraft(tomb: Tombstone): Promise<AddressableDraft> {
	const payload: Tombstoned = { deleted: true, updatedAt: tomb.deletedAt };
	return {
		kind: tomb.kind,
		d: tomb.d,
		content: await sealed(payload),
		tags: [],
		updatedAt: tomb.deletedAt
	};
}

/** Immutable NIP-84 highlight derived from a shared annotation (compat export). */
export function highlightExport(anno: Annotation, book: Book): Partial<SimpleNostrEvent> {
	const tags: string[][] = [
		['a', `${KIND_ANNOTATION}:${selfPubkey()}:${anno.id}`],
		['x', anno.sha256],
		...isbnTags(book),
		['context', anno.quote]
	];
	if (anno.note) tags.push(['comment', anno.note]);
	return { kind: KIND_HIGHLIGHT, content: anno.quote, tags };
}

// ---- decode (relay event → parsed record) ----

export type ParsedRemote =
	| { kind: typeof KIND_BOOK; d: string; deleted: boolean; updatedAt: number; shared: boolean; book?: Omit<Book, 'sha256'> }
	| { kind: typeof KIND_PROGRESS; d: string; deleted: boolean; updatedAt: number; progress?: Omit<ReadingProgress, 'sha256'> }
	| { kind: typeof KIND_SETTINGS; d: string; deleted: boolean; updatedAt: number; reading?: ReadingSettings }
	| { kind: typeof KIND_ANNOTATION; d: string; deleted: boolean; updatedAt: number; shared: boolean; annotation?: Omit<Annotation, 'id'> };

function dTagOf(event: SimpleNostrEvent): string | undefined {
	return event.tags.find((t) => t[0] === 'd')?.[1];
}

/** Newest event per (kind, d) — relays can return stale addressable versions. */
export function dedupeByAddress(events: SimpleNostrEvent[]): SimpleNostrEvent[] {
	const byAddress = new Map<string, SimpleNostrEvent>();
	for (const event of events) {
		const d = dTagOf(event);
		if (d === undefined) continue;
		const key = `${event.kind}:${d}`;
		const existing = byAddress.get(key);
		if (!existing || event.created_at > existing.created_at) byAddress.set(key, event);
	}
	return [...byAddress.values()];
}

export async function parseRemote(event: SimpleNostrEvent): Promise<ParsedRemote | null> {
	const d = dTagOf(event);
	if (d === undefined) return null;

	let payload: Record<string, unknown>;
	let shared = false;
	try {
		if (event.content.startsWith('{')) {
			// Shared annotations are plaintext JSON.
			payload = JSON.parse(event.content) as Record<string, unknown>;
			shared = true;
		} else {
			payload = JSON.parse(await cyphertap.decrypt(event.content, selfPubkey())) as Record<
				string,
				unknown
			>;
		}
	} catch {
		return null; // Unreadable (foreign ciphertext, garbage) — skip, don't crash the sync.
	}

	const updatedAt = typeof payload.updatedAt === 'number' ? payload.updatedAt : event.created_at * 1000;
	const deleted = payload.deleted === true;
	const base = { d, deleted, updatedAt };

	switch (event.kind) {
		case KIND_BOOK:
			return {
				kind: KIND_BOOK,
				...base,
				shared,
				book: deleted ? undefined : ({ ...payload, shared } as unknown as Omit<Book, 'sha256'>)
			};
		case KIND_PROGRESS:
			return {
				kind: KIND_PROGRESS,
				...base,
				progress: deleted ? undefined : (payload as unknown as Omit<ReadingProgress, 'sha256'>)
			};
		case KIND_SETTINGS:
			return {
				kind: KIND_SETTINGS,
				...base,
				reading: deleted ? undefined : (payload.reading as ReadingSettings)
			};
		case KIND_ANNOTATION: {
			if (deleted) return { kind: KIND_ANNOTATION, ...base, shared };
			const { book, ...rest } = payload as { book: string } & Record<string, unknown>;
			if (typeof book !== 'string') return null;
			return {
				kind: KIND_ANNOTATION,
				...base,
				shared,
				annotation: { sha256: book, shared, ...rest } as unknown as Omit<Annotation, 'id'>
			};
		}
		default:
			return null;
	}
}

// ---- decode (someone ELSE's events — browse) ----

export type ParsedForeign =
	| { kind: typeof KIND_BOOK; sha256: string; book: Omit<Book, 'sha256'> }
	| { kind: typeof KIND_ANNOTATION; id: string; annotation: Omit<Annotation, 'id'> };

/**
 * Parse another user's event: plaintext only (their ciphertext is noise to
 * us — never attempt decryption), tombstones and garbage → null.
 */
export function parseForeign(event: SimpleNostrEvent): ParsedForeign | null {
	const d = dTagOf(event);
	if (d === undefined || !event.content.startsWith('{')) return null;

	let payload: Record<string, unknown>;
	try {
		payload = JSON.parse(event.content) as Record<string, unknown>;
	} catch {
		return null;
	}
	if (payload.deleted === true) return null;

	if (event.kind === KIND_BOOK) {
		if (typeof payload.title !== 'string') return null;
		return { kind: KIND_BOOK, sha256: d, book: payload as unknown as Omit<Book, 'sha256'> };
	}
	if (event.kind === KIND_ANNOTATION) {
		const { book, ...rest } = payload as { book: string } & Record<string, unknown>;
		if (typeof book !== 'string' || typeof payload.quote !== 'string') return null;
		return {
			kind: KIND_ANNOTATION,
			id: d,
			annotation: { sha256: book, ...rest } as unknown as Omit<Annotation, 'id'>
		};
	}
	return null;
}
