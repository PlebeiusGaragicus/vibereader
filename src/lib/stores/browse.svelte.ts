// Browse other users' public shelves — read-only and session-memory only.
// Nothing foreign is ever written to the per-npub DB, nothing is published
// while browsing, and every relay fetch traces back to an explicit action.

import { toast } from 'svelte-sonner';
import { cyphertap, hexToNpub, npubToHex, type SimpleNostrEvent } from 'cyphertap';
import { db } from '$lib/db/index.js';
import type { Annotation, Book } from '$lib/db/types.js';
import { importEpubFile } from '$lib/epub/import.js';
import { downloadBlob } from '$lib/nostr/blossom.js';
import { dedupeByAddress, parseForeign } from '$lib/nostr/events.js';
import { KIND_ANNOTATION, KIND_BOOK } from '$lib/nostr/kinds.js';
import { compareCfi } from '$lib/epub/service.js';
import { library } from './library.svelte.js';

export interface ForeignProfile {
	hex: string;
	name?: string;
	picture?: string;
}

export interface ForeignBook {
	sha256: string;
	book: Omit<Book, 'sha256'>;
	annotations: Annotation[]; // spine-sorted, read-only
	inLibrary: boolean;
	coverUrl?: string;
}

export interface Reader {
	profile: ForeignProfile;
	count: number;
}

let mode = $state<'start' | 'shelf' | 'readers'>('start');
let follows = $state<ForeignProfile[] | null>(null); // null = not fetched yet
let target = $state<ForeignProfile | null>(null);
let shelf = $state<ForeignBook[]>([]);
/** Their shared annotations on books NOT on their shelf (e.g. mine). */
let looseAnnotations = $state<Record<string, Annotation[]>>({});
let readers = $state<Reader[]>([]);
let readersBook = $state<{ sha256: string; title: string } | null>(null);
let loading = $state(false);
let downloading = $state<Record<string, boolean>>({});
let coverUrls: string[] = [];

function shortNpub(hex: string): string {
	try {
		return `${hexToNpub(hex).slice(0, 12)}…`;
	} catch {
		return `${hex.slice(0, 8)}…`;
	}
}

/** kind-0 metadata for a batch of pubkeys; newest event per author wins. */
async function fetchProfiles(hexes: string[]): Promise<Map<string, ForeignProfile>> {
	const result = new Map<string, ForeignProfile>(hexes.map((h) => [h, { hex: h }]));
	if (!hexes.length) return result;
	try {
		const events = await cyphertap.fetchEvents({ kinds: [0], authors: hexes });
		const newest = new Map<string, SimpleNostrEvent>();
		for (const ev of events) {
			const seen = newest.get(ev.pubkey);
			if (!seen || ev.created_at > seen.created_at) newest.set(ev.pubkey, ev);
		}
		for (const [hex, ev] of newest) {
			try {
				const meta = JSON.parse(ev.content) as Record<string, unknown>;
				result.set(hex, {
					hex,
					name:
						(typeof meta.display_name === 'string' && meta.display_name) ||
						(typeof meta.name === 'string' && meta.name) ||
						undefined,
					picture: typeof meta.picture === 'string' ? meta.picture : undefined
				});
			} catch {
				// Unparseable profile — keep the bare hex entry.
			}
		}
	} catch {
		// Profile lookup is cosmetic — never fail the browse over it.
	}
	return result;
}

function resolveHex(input: string): string | null {
	const trimmed = input.trim();
	if (/^[0-9a-f]{64}$/i.test(trimmed)) return trimmed.toLowerCase();
	try {
		return npubToHex(trimmed);
	} catch {
		return null;
	}
}

function open(): void {
	mode = 'start';
	if (follows === null) void loadFollows();
}

async function loadFollows(): Promise<void> {
	try {
		const hexes = await cyphertap.getFollows();
		const profiles = await fetchProfiles(hexes);
		follows = hexes.map((h) => profiles.get(h) ?? { hex: h });
	} catch {
		follows = [];
	}
}

/** Fetch and display someone's public shelf (plaintext 30101 + 30104). */
async function browseUser(input: string): Promise<void> {
	const hex = resolveHex(input);
	if (!hex) {
		toast.error('Not a valid npub or hex pubkey');
		return;
	}
	loading = true;
	try {
		const [profiles, events] = await Promise.all([
			fetchProfiles([hex]),
			cyphertap.fetchEvents({ kinds: [KIND_BOOK, KIND_ANNOTATION], authors: [hex] })
		]);
		target = profiles.get(hex) ?? { hex };

		const books = new Map<string, Omit<Book, 'sha256'>>();
		const annosBySha = new Map<string, Annotation[]>();
		for (const event of dedupeByAddress(events)) {
			const parsed = parseForeign(event);
			if (!parsed) continue; // Their private (encrypted) events are noise to us.
			if (parsed.kind === KIND_BOOK) books.set(parsed.sha256, parsed.book);
			else {
				const anno = { id: parsed.id, ...parsed.annotation } as Annotation;
				const list = annosBySha.get(anno.sha256) ?? [];
				list.push(anno);
				annosBySha.set(anno.sha256, list);
			}
		}

		const nextShelf: ForeignBook[] = [];
		for (const [sha256, book] of books) {
			nextShelf.push({
				sha256,
				book,
				annotations: (annosBySha.get(sha256) ?? []).sort((a, b) =>
					compareCfi(a.cfiRange, b.cfiRange)
				),
				inLibrary: Boolean(await db.books.get(sha256))
			});
			annosBySha.delete(sha256);
		}
		nextShelf.sort((a, b) => (b.book.updatedAt ?? 0) - (a.book.updatedAt ?? 0));
		shelf = nextShelf;
		looseAnnotations = Object.fromEntries(
			[...annosBySha].map(([sha, list]) => [sha, list.sort((a, b) => compareCfi(a.cfiRange, b.cfiRange))])
		);
		mode = 'shelf';

		// Covers are cosmetic and slow — fill in after the shelf renders.
		for (const fb of shelf) {
			const { blossom } = fb.book;
			if (!blossom?.coverSha256) continue;
			void downloadBlob(blossom.servers, blossom.coverSha256)
				.then(({ blob }) => {
					const url = URL.createObjectURL(blob);
					coverUrls.push(url);
					fb.coverUrl = url;
				})
				.catch(() => {});
		}
	} catch (err) {
		console.error(err);
		toast.error('Could not fetch this library');
	} finally {
		loading = false;
	}
}

/** Everyone who shared annotations on this book (the `#x` query). */
async function findReaders(sha256: string, title: string): Promise<void> {
	loading = true;
	readersBook = { sha256, title };
	mode = 'readers';
	try {
		const events = await cyphertap.fetchEvents({ kinds: [KIND_ANNOTATION], '#x': [sha256] });
		const me = cyphertap.getUserHex();
		const counts = new Map<string, number>();
		for (const event of dedupeByAddress(events)) {
			if (event.pubkey === me) continue;
			if (!parseForeign(event)) continue;
			counts.set(event.pubkey, (counts.get(event.pubkey) ?? 0) + 1);
		}
		const profiles = await fetchProfiles([...counts.keys()]);
		readers = [...counts]
			.map(([hex, count]) => ({ profile: profiles.get(hex) ?? { hex }, count }))
			.sort((a, b) => b.count - a.count);
	} catch (err) {
		console.error(err);
		toast.error('Could not search for readers');
		readers = [];
	} finally {
		loading = false;
	}
}

/** Import a friend's shared book into MY library, straight from their
 * Blossom backup (hash-verified by downloadBlob). */
async function downloadBook(fb: ForeignBook): Promise<void> {
	const servers = fb.book.blossom?.servers;
	if (!servers?.length || downloading[fb.sha256]) return;
	downloading[fb.sha256] = true;
	try {
		const { blob } = await downloadBlob(servers, fb.sha256, '.epub');
		const file = new File([blob], `${fb.book.title || fb.sha256}.epub`, {
			type: 'application/epub+zip'
		});
		await importEpubFile(file);
		await library.refresh();
		fb.inLibrary = true;
		toast.success(`Added “${fb.book.title}” to your library`);
	} catch (err) {
		toast.error(err instanceof Error ? err.message : 'Download failed');
	} finally {
		downloading[fb.sha256] = false;
	}
}

function reset(): void {
	for (const url of coverUrls) URL.revokeObjectURL(url);
	coverUrls = [];
	mode = 'start';
	follows = null;
	target = null;
	shelf = [];
	looseAnnotations = {};
	readers = [];
	readersBook = null;
	loading = false;
	downloading = {};
}

export const browse = {
	get mode() {
		return mode;
	},
	set mode(v: 'start' | 'shelf' | 'readers') {
		mode = v;
	},
	get follows() {
		return follows;
	},
	get target() {
		return target;
	},
	get shelf() {
		return shelf;
	},
	get looseAnnotations() {
		return looseAnnotations;
	},
	get readers() {
		return readers;
	},
	get readersBook() {
		return readersBook;
	},
	get loading() {
		return loading;
	},
	isDownloading(sha256: string) {
		return downloading[sha256] ?? false;
	},
	shortNpub,
	open,
	loadFollows,
	browseUser,
	findReaders,
	downloadBook,
	reset
};
