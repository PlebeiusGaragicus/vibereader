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
let missingFiles = $state<Record<string, boolean>>({});
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
	await refresh();
}

/** Re-read everything from the DB (after sync/restore pulls in changes). */
async function refresh(): Promise<void> {
	for (const url of Object.values(coverUrls)) URL.revokeObjectURL(url);
	coverUrls = {};
	missingFiles = {};
	books = await db.books.getAll();
	for (const record of await db.progress.getAll()) {
		progressBySha[record.sha256] = record.percentage;
	}
	await Promise.all(
		books.map(async (b) => {
			await loadCover(b.sha256);
			if (!(await db.bookFiles.get(b.sha256))) missingFiles[b.sha256] = true;
		})
	);
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
		void import('./sync.svelte.js').then(({ sync }) => sync.checkDirty());
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
	void import('./sync.svelte.js').then(({ sync }) => sync.checkDirty());
}

async function open(sha256: string): Promise<void> {
	const book = books.find((b) => b.sha256 === sha256);
	if (!book) return;
	if (missingFiles[sha256]) {
		toast.info('This book’s file isn’t on this device — restore it from Blossom first.');
		return;
	}
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
	missingFiles = {};
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
	get missingFiles() {
		return missingFiles;
	},
	get importing() {
		return importing;
	},
	init,
	refresh,
	importFiles,
	deleteBook,
	open,
	noteProgress,
	reset
};
