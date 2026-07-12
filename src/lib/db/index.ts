// IndexedDB persistence, one database per nostr identity.
//
// The database name embeds the npub (`vibereader::<npub>`), so identity
// isolation is structural: there is no per-query npub filter to forget, logout
// is just closing the connection, and "delete my data" is deleteDatabase.
// `setCurrentUser(npub)` must be called (at login) before any other operation.

import { openDB, deleteDB, type DBSchema, type IDBPDatabase } from 'idb';
import { KIND_ANNOTATION, KIND_BOOK, KIND_PROGRESS } from '$lib/nostr/kinds.js';
import type {
	Annotation,
	Book,
	BookFile,
	ChatThread,
	Cover,
	LocationsCache,
	ReadingProgress,
	Tombstone
} from './types.js';

const DB_PREFIX = 'vibereader';
const DB_VERSION = 2;

interface VibeReaderDB extends DBSchema {
	books: {
		key: string; // sha256
		value: Book;
		indexes: { 'by-added': number; 'by-lastOpened': number };
	};
	bookFiles: {
		key: string; // sha256
		value: BookFile;
	};
	covers: {
		key: string; // sha256
		value: Cover;
	};
	locations: {
		key: string; // sha256
		value: LocationsCache;
	};
	progress: {
		key: string; // sha256
		value: ReadingProgress;
	};
	annotations: {
		key: string; // anno-<nanoid>
		value: Annotation;
		indexes: { 'by-book': string; 'by-updated': number };
	};
	chats: {
		key: string;
		value: ChatThread;
		indexes: { 'by-book': string; 'by-updated': number };
	};
	kv: {
		key: string;
		value: { key: string; value: unknown };
	};
	tombstones: {
		key: string; // `<kind>:<d-tag>`
		value: Tombstone;
	};
}

let currentNpub: string | null = null;
let dbPromise: Promise<IDBPDatabase<VibeReaderDB>> | null = null;

function dbName(npub: string): string {
	return `${DB_PREFIX}::${npub}`;
}

export function setCurrentUser(npub: string): void {
	if (currentNpub === npub) return;
	closeUserDB();
	currentNpub = npub;
}

export function closeUserDB(): void {
	if (dbPromise) {
		void dbPromise.then((db) => db.close()).catch(() => {});
	}
	dbPromise = null;
	currentNpub = null;
}

export async function deleteUserData(npub: string): Promise<void> {
	if (currentNpub === npub) closeUserDB();
	await deleteDB(dbName(npub));
}

function getDB(): Promise<IDBPDatabase<VibeReaderDB>> {
	if (!currentNpub) {
		return Promise.reject(new Error('No user set — call setCurrentUser(npub) after login.'));
	}
	if (!dbPromise) {
		dbPromise = openDB<VibeReaderDB>(dbName(currentNpub), DB_VERSION, {
			upgrade(db, oldVersion) {
				if (oldVersion < 1) {
					const books = db.createObjectStore('books', { keyPath: 'sha256' });
					books.createIndex('by-added', 'addedAt');
					books.createIndex('by-lastOpened', 'lastOpenedAt');

					db.createObjectStore('bookFiles', { keyPath: 'sha256' });
					db.createObjectStore('covers', { keyPath: 'sha256' });
					db.createObjectStore('locations', { keyPath: 'sha256' });
					db.createObjectStore('progress', { keyPath: 'sha256' });

					const annotations = db.createObjectStore('annotations', { keyPath: 'id' });
					annotations.createIndex('by-book', 'sha256');
					annotations.createIndex('by-updated', 'updatedAt');

					const chats = db.createObjectStore('chats', { keyPath: 'id' });
					chats.createIndex('by-book', 'sha256');
					chats.createIndex('by-updated', 'updatedAt');

					db.createObjectStore('kv', { keyPath: 'key' });
				}
				if (oldVersion < 2) {
					db.createObjectStore('tombstones', { keyPath: 'key' });
				}
			}
		});
	}
	return dbPromise;
}

/** Svelte $state proxies can't be structured-cloned; strip them before put. */
function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

// ---- books ----

async function getAllBooks(): Promise<Book[]> {
	return (await getDB()).getAll('books');
}

async function getBook(sha256: string): Promise<Book | undefined> {
	return (await getDB()).get('books', sha256);
}

async function saveBook(book: Book): Promise<void> {
	await (await getDB()).put('books', clone(book));
}

/**
 * Cascade-delete a book and everything under it in one transaction, leaving
 * tombstones so the deletion propagates on the next sync (never resurrects).
 */
async function deleteBookCascade(sha256: string): Promise<void> {
	const db = await getDB();
	const tx = db.transaction(
		['books', 'bookFiles', 'covers', 'locations', 'progress', 'annotations', 'chats', 'tombstones'],
		'readwrite'
	);
	const deletedAt = Date.now();
	const tombstones = tx.objectStore('tombstones');

	for (const store of ['annotations', 'chats'] as const) {
		const index = tx.objectStore(store).index('by-book');
		let cursor = await index.openCursor(IDBKeyRange.only(sha256));
		while (cursor) {
			if (store === 'annotations') {
				const d = String(cursor.primaryKey);
				await tombstones.put({ key: `${KIND_ANNOTATION}:${d}`, kind: KIND_ANNOTATION, d, deletedAt });
			}
			await cursor.delete();
			cursor = await cursor.continue();
		}
	}

	for (const store of ['bookFiles', 'covers', 'locations', 'progress', 'books'] as const) {
		await tx.objectStore(store).delete(sha256);
	}
	for (const kind of [KIND_BOOK, KIND_PROGRESS]) {
		await tombstones.put({ key: `${kind}:${sha256}`, kind, d: sha256, deletedAt });
	}
	await tx.done;
}

// ---- blobs (raw put/get — Blob payloads must NOT go through clone()) ----

async function getBookFile(sha256: string): Promise<BookFile | undefined> {
	return (await getDB()).get('bookFiles', sha256);
}

async function saveBookFile(record: BookFile): Promise<void> {
	await (await getDB()).put('bookFiles', record);
}

async function getCover(sha256: string): Promise<Cover | undefined> {
	return (await getDB()).get('covers', sha256);
}

async function saveCover(record: Cover): Promise<void> {
	await (await getDB()).put('covers', record);
}

/** Import writes metadata + bytes + cover atomically (blobs stay un-cloned). */
async function importBook(book: Book, file: BookFile, cover?: Cover): Promise<void> {
	const db = await getDB();
	const tx = db.transaction(['books', 'bookFiles', 'covers'], 'readwrite');
	await tx.objectStore('books').put(clone(book));
	await tx.objectStore('bookFiles').put(file);
	if (cover) await tx.objectStore('covers').put(cover);
	await tx.done;
}

// ---- locations / progress ----

async function getLocations(sha256: string): Promise<LocationsCache | undefined> {
	return (await getDB()).get('locations', sha256);
}

async function saveLocations(record: LocationsCache): Promise<void> {
	await (await getDB()).put('locations', clone(record));
}

async function getProgress(sha256: string): Promise<ReadingProgress | undefined> {
	return (await getDB()).get('progress', sha256);
}

async function getAllProgress(): Promise<ReadingProgress[]> {
	return (await getDB()).getAll('progress');
}

async function saveProgress(record: ReadingProgress): Promise<void> {
	await (await getDB()).put('progress', clone(record));
}

// ---- annotations ----

async function getBookAnnotations(sha256: string): Promise<Annotation[]> {
	return (await getDB()).getAllFromIndex('annotations', 'by-book', sha256);
}

async function getAllAnnotations(): Promise<Annotation[]> {
	return (await getDB()).getAll('annotations');
}

async function saveAnnotation(annotation: Annotation): Promise<void> {
	await (await getDB()).put('annotations', clone(annotation));
}

async function deleteAnnotation(id: string): Promise<void> {
	const db = await getDB();
	const tx = db.transaction(['annotations', 'tombstones'], 'readwrite');
	await tx
		.objectStore('tombstones')
		.put({ key: `${KIND_ANNOTATION}:${id}`, kind: KIND_ANNOTATION, d: id, deletedAt: Date.now() });
	await tx.objectStore('annotations').delete(id);
	await tx.done;
}

// ---- tombstones ----

async function getAllTombstones(): Promise<Tombstone[]> {
	return (await getDB()).getAll('tombstones');
}

async function saveTombstone(record: Tombstone): Promise<void> {
	await (await getDB()).put('tombstones', clone(record));
}

async function getTombstone(kind: number, d: string): Promise<Tombstone | undefined> {
	return (await getDB()).get('tombstones', `${kind}:${d}`);
}

// ---- chats ----

async function getBookChats(sha256: string): Promise<ChatThread[]> {
	return (await getDB()).getAllFromIndex('chats', 'by-book', sha256);
}

async function saveChat(thread: ChatThread): Promise<void> {
	await (await getDB()).put('chats', clone(thread));
}

async function deleteChat(id: string): Promise<void> {
	await (await getDB()).delete('chats', id);
}

// ---- kv ----

async function getKV<T>(key: string): Promise<T | undefined> {
	const entry = await (await getDB()).get('kv', key);
	return entry?.value as T | undefined;
}

async function saveKV(key: string, value: unknown): Promise<void> {
	await (await getDB()).put('kv', { key, value: clone(value) });
}

export const db = {
	books: {
		getAll: getAllBooks,
		get: getBook,
		save: saveBook,
		import: importBook,
		delete: deleteBookCascade
	},
	bookFiles: {
		get: getBookFile,
		save: saveBookFile
	},
	covers: {
		get: getCover,
		save: saveCover
	},
	locations: {
		get: getLocations,
		save: saveLocations
	},
	progress: {
		get: getProgress,
		getAll: getAllProgress,
		save: saveProgress
	},
	annotations: {
		getAll: getAllAnnotations,
		getByBook: getBookAnnotations,
		save: saveAnnotation,
		delete: deleteAnnotation
	},
	chats: {
		getByBook: getBookChats,
		save: saveChat,
		delete: deleteChat
	},
	kv: {
		get: getKV,
		save: saveKV
	},
	tombstones: {
		getAll: getAllTombstones,
		get: getTombstone,
		save: saveTombstone
	}
};
