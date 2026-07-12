// EPUB import: hash → dedup → metadata/cover extraction → one-transaction
// write. The file's sha256 IS the book's identity (see docs/nostr-event-model.md).

import ePub from 'epubjs';
import { db } from '$lib/db/index.js';
import type { Book } from '$lib/db/types.js';

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', buffer);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class DuplicateBookError extends Error {
	constructor(public existing: Book) {
		super(`Already in library: ${existing.title}`);
	}
}

/** Pull a bare ISBN out of an EPUB identifier like "urn:isbn:978…". */
function extractIsbn(identifier: string | undefined): string | undefined {
	const match = identifier?.replace(/-/g, '').match(/isbn:?(\d{10,13})/i) ?? null;
	return match?.[1];
}

/** Pull the cover image out of EPUB bytes (throwaway epub.js instance) —
 * used at import, and again after a Blossom restore, where the bytes are the
 * only cover source we can rely on. */
export async function extractCover(
	buffer: ArrayBuffer
): Promise<{ blob: Blob; mimeType: string } | undefined> {
	const epub = ePub(buffer);
	try {
		await epub.ready;
		const coverUrl = await epub.coverUrl();
		if (!coverUrl) return undefined;
		const blob = await (await fetch(coverUrl)).blob();
		return { blob, mimeType: blob.type || 'image/jpeg' };
	} catch {
		return undefined; // No cover is fine.
	} finally {
		epub.destroy();
	}
}

export async function importEpubFile(file: File): Promise<Book> {
	const buffer = await file.arrayBuffer();
	const sha256 = await sha256Hex(buffer);

	const existing = await db.books.get(sha256);
	if (existing) throw new DuplicateBookError(existing);

	const cover = await extractCover(buffer);

	// Throwaway instance just for metadata; the reader opens its own.
	const epub = ePub(buffer);
	try {
		await epub.ready;
		const metadata = await epub.loaded.metadata;

		const now = Date.now();
		const book: Book = {
			sha256,
			title: metadata.title || file.name.replace(/\.epub$/i, ''),
			creator: metadata.creator || 'Unknown',
			publisher: metadata.publisher || undefined,
			language: metadata.language || undefined,
			isbn: extractIsbn(metadata.identifier),
			description: metadata.description || undefined,
			fileSize: file.size,
			addedAt: now,
			updatedAt: now
		};

		await db.books.import(
			book,
			{ sha256, blob: new Blob([buffer], { type: 'application/epub+zip' }) },
			cover ? { sha256, ...cover } : undefined
		);
		return book;
	} finally {
		epub.destroy();
	}
}
