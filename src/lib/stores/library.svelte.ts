// The user's bookshelf: metadata list + cover object URLs. Blobs stay in
// IndexedDB; this store only ever holds what the grid needs. Import and the
// full reader arrive in Phase B — init/reset exist now so the session
// lifecycle is complete from day one.

import { db } from '$lib/db/index.js';
import type { Book } from '$lib/db/types.js';

let books = $state<Book[]>([]);
let coverUrls = $state<Record<string, string>>({});
let isInitialized = false;

const sorted = $derived(
	[...books].sort((a, b) => (b.lastOpenedAt ?? b.addedAt) - (a.lastOpenedAt ?? a.addedAt))
);

async function init(): Promise<void> {
	if (isInitialized) return;
	isInitialized = true;
	books = await db.books.getAll();
	for (const book of books) {
		const cover = await db.covers.get(book.sha256);
		if (cover) coverUrls[book.sha256] = URL.createObjectURL(cover.blob);
	}
}

function reset(): void {
	for (const url of Object.values(coverUrls)) URL.revokeObjectURL(url);
	books = [];
	coverUrls = {};
	isInitialized = false;
}

export const library = {
	get books() {
		return sorted;
	},
	get coverUrls() {
		return coverUrls;
	},
	init,
	reset
};
