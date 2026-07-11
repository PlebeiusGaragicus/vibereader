// The user's bookshelf: metadata list + cover object URLs + progress badges.
// Blobs stay in IndexedDB; this store only ever holds what the grid needs.

import { toast } from 'svelte-sonner';
import { db } from '$lib/db/index.js';
import type { Book } from '$lib/db/types.js';
import { DuplicateBookError, importEpubFile } from '$lib/epub/import.js';
import { reader } from './reader.svelte.js';

let books = $state<Book[]>([]);
let coverUrls = $state<Record<string, string>>({});
let progressBySha = $state<Record<string, number>>({});
let importing = $state(false);
let isInitialized = false;

const sorted = $derived(
	[...books].sort((a, b) => (b.lastOpenedAt ?? b.addedAt) - (a.lastOpenedAt ?? a.addedAt))
);

async function loadCover(sha256: string): Promise<void> {
	const cover = await db.covers.get(sha256);
	if (cover) coverUrls[sha256] = URL.createObjectURL(cover.blob);
}

async function init(): Promise<void> {
	if (isInitialized) return;
	isInitialized = true;
	books = await db.books.getAll();
	for (const record of await db.progress.getAll()) {
		progressBySha[record.sha256] = record.percentage;
	}
	await Promise.all(books.map((b) => loadCover(b.sha256)));
}

async function importFiles(files: Iterable<File>): Promise<void> {
	importing = true;
	try {
		for (const file of files) {
			if (!/\.epub$/i.test(file.name)) {
				toast.error(`Not an EPUB: ${file.name}`);
				continue;
			}
			try {
				const book = await importEpubFile(file);
				books.push(book);
				await loadCover(book.sha256);
				toast.success(`Imported “${book.title}”`);
			} catch (err) {
				if (err instanceof DuplicateBookError) {
					toast.info(`Already in your library: “${err.existing.title}”`);
				} else {
					console.error(err);
					toast.error(`Could not import ${file.name}`);
				}
			}
		}
	} finally {
		importing = false;
	}
}

async function deleteBook(sha256: string): Promise<void> {
	await db.books.delete(sha256);
	books = books.filter((b) => b.sha256 !== sha256);
	const url = coverUrls[sha256];
	if (url) {
		URL.revokeObjectURL(url);
		delete coverUrls[sha256];
	}
	delete progressBySha[sha256];
}

async function open(sha256: string): Promise<void> {
	const book = books.find((b) => b.sha256 === sha256);
	if (!book) return;
	try {
		await reader.open(book);
	} catch (err) {
		console.error(err);
		toast.error('Could not open this book');
		reader.close();
	}
}

/** Keep the library card's % in step while reading. */
function noteProgress(sha256: string, percentage: number | undefined): void {
	if (percentage !== undefined) progressBySha[sha256] = percentage;
}

function reset(): void {
	for (const url of Object.values(coverUrls)) URL.revokeObjectURL(url);
	books = [];
	coverUrls = {};
	progressBySha = {};
	importing = false;
	isInitialized = false;
}

export const library = {
	get books() {
		return sorted;
	},
	get coverUrls() {
		return coverUrls;
	},
	get progressBySha() {
		return progressBySha;
	},
	get importing() {
		return importing;
	},
	init,
	importFiles,
	deleteBook,
	open,
	noteProgress,
	reset
};
