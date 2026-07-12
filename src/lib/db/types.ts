// The ONE canonical data shape — camelCase everywhere, mirrored 1:1 by the
// nostr event content schemas in docs/nostr-event-model.md. Timestamps are
// Unix ms. A book's identity is its EPUB file's sha256 (lowercase hex): the
// IndexedDB key, the future Blossom address, and the nostr d-tag are all the
// same string.

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple';

/** Library metadata only — the grid never touches blobs. */
export interface Book {
	sha256: string;
	title: string;
	creator: string;
	publisher?: string;
	language?: string;
	isbn?: string;
	description?: string;
	fileSize: number;
	/** Blossom servers holding the (raw, public-by-hash) EPUB + cover. */
	blossom?: { servers: string[]; coverSha256?: string };
	/** On the user's public shelf: 30101 published as plaintext (still editable). */
	shared?: boolean;
	addedAt: number;
	updatedAt: number;
	lastOpenedAt?: number;
}

/** The EPUB bytes, stored raw (never JSON-cloned — that destroys Blobs). */
export interface BookFile {
	sha256: string;
	blob: Blob;
}

export interface Cover {
	sha256: string;
	blob: Blob;
	mimeType: string;
}

/** Cached epub.js `book.locations.save()` output — generating is slow. */
export interface LocationsCache {
	sha256: string;
	locationsJson: string;
	charsPerLocation: number;
	generatedAt: number;
}

export interface ReadingProgress {
	sha256: string;
	cfi: string;
	percentage: number; // 0–1
	sectionHref?: string;
	updatedAt: number;
}

/**
 * Unified annotation: highlight-only (color, no note), note-only (note, no
 * color), or both. Maps 1:1 onto kind-30104 event content.
 */
export interface Annotation {
	id: string; // `anno-<nanoid>` — the nostr d-tag
	sha256: string;
	cfiRange: string;
	quote: string;
	color?: HighlightColor;
	note?: string;
	/** Published as plaintext 30104 with query tags (still editable). */
	shared?: boolean;
	createdAt: number;
	updatedAt: number;
}

/**
 * Record of a propagated deletion: keeps local pushes from resurrecting a
 * record another device deleted, and drives the tombstone events we publish.
 */
export interface Tombstone {
	key: string; // `<kind>:<d-tag>`
	kind: number;
	d: string;
	deletedAt: number;
}

export interface ChatMessage {
	role: 'user' | 'assistant';
	content: string;
	createdAt: number;
}

/** Device-local chat thread (deliberately not part of the sync schema). */
export interface ChatThread {
	id: string;
	sha256: string;
	title: string;
	context?: { cfiRange: string; quote: string };
	messages: ChatMessage[];
	createdAt: number;
	updatedAt: number;
}
