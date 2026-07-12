// Sync UI state: the explicit "Sync" action, the unsynced-changes dot, and
// per-book Blossom backup/restore. Nothing here runs on a timer — every
// relay/Blossom touch traces back to a click.

import { toast } from 'svelte-sonner';
import { db } from '$lib/db/index.js';
import { extractCover } from '$lib/epub/import.js';
import { canUpload, downloadBlob, publishServerList, uploadBlob } from '$lib/nostr/blossom.js';
import { lastSyncAt, syncNow } from '$lib/nostr/sync.js';
import { library } from './library.svelte.js';
import { settingsStore } from './settings.svelte.js';

let syncing = $state(false);
let backingUp = $state<Record<string, boolean>>({});
let dirty = $state(false);
let lastSynced = $state(0);

async function checkDirty(): Promise<void> {
	lastSynced = await lastSyncAt();
	const [books, progress, annotations, tombstones] = await Promise.all([
		db.books.getAll(),
		db.progress.getAll(),
		db.annotations.getAll(),
		db.tombstones.getAll()
	]);
	const newest = Math.max(
		0,
		...books.map((b) => b.updatedAt),
		...progress.map((p) => p.updatedAt),
		...annotations.map((a) => a.updatedAt),
		...tombstones.map((t) => t.deletedAt),
		settingsStore.settings.readingUpdatedAt
	);
	dirty = newest > lastSynced;
}

async function run(): Promise<void> {
	if (syncing) return;
	syncing = true;
	try {
		const summary = await syncNow(settingsStore.settings.relays, {
			readingSettings: () => ({
				reading: settingsStore.settings.reading,
				updatedAt: settingsStore.settings.readingUpdatedAt
			}),
			applyRemoteReading: settingsStore.applyRemoteReading
		});
		await library.refresh();
		await checkDirty();
		const restorable = summary.restorableBooks.length;
		toast.success(
			`Synced — pushed ${summary.pushed}, pulled ${summary.pulled}` +
				(summary.deletedLocally ? `, removed ${summary.deletedLocally}` : '') +
				(restorable ? `. ${restorable} book${restorable > 1 ? 's' : ''} can be restored.` : '')
		);
	} catch (err) {
		console.error(err);
		toast.error(err instanceof Error ? err.message : 'Sync failed');
	} finally {
		syncing = false;
	}
}

/** Upload a book's EPUB (+cover) to the configured Blossom servers — raw and
 * public-by-hash; the UI shows the warning before first use. */
async function backupBook(sha256: string): Promise<void> {
	if (backingUp[sha256]) return;
	backingUp[sha256] = true;
	try {
		const [file, cover, book] = await Promise.all([
			db.bookFiles.get(sha256),
			db.covers.get(sha256),
			db.books.get(sha256)
		]);
		if (!file || !book) throw new Error('Book file not found locally');

		const servers = settingsStore.settings.blossomServers;
		const succeeded: string[] = [];
		let coverSha: string | undefined;
		for (const server of servers) {
			try {
				const pre = await canUpload(server, sha256, file.blob.size, 'application/epub+zip');
				if (!pre.ok) {
					toast.error(`${server}: ${pre.reason}`);
					continue;
				}
				await uploadBlob(server, file.blob, sha256);
				if (cover) {
					const { sha256Hex } = await import('$lib/epub/import.js');
					coverSha = await sha256Hex(await cover.blob.arrayBuffer());
					await uploadBlob(server, cover.blob, coverSha).catch(() => (coverSha = undefined));
				}
				succeeded.push(server);
			} catch (err) {
				toast.error(err instanceof Error ? err.message : `Upload to ${server} failed`);
			}
		}
		if (!succeeded.length) return;

		book.blossom = { servers: succeeded, coverSha256: coverSha };
		book.updatedAt = Date.now();
		await db.books.save(book);
		await publishServerList(servers).catch(() => {});
		await library.refresh();
		await checkDirty();
		toast.success(`Backed up to ${succeeded.length} server${succeeded.length > 1 ? 's' : ''} — sync to record it`);
	} finally {
		backingUp[sha256] = false;
	}
}

/** Fetch a restorable book's bytes back from Blossom (hash re-verified). */
async function restoreBook(sha256: string): Promise<void> {
	if (backingUp[sha256]) return;
	backingUp[sha256] = true;
	try {
		const book = await db.books.get(sha256);
		// Recorded servers first, then the configured list — a blob can exist on
		// an unrecorded server (backed up elsewhere before that record synced).
		const servers = [
			...new Set([...(book?.blossom?.servers ?? []), ...settingsStore.settings.blossomServers])
		];
		const { blob, server } = await downloadBlob(servers, sha256, '.epub');
		await db.bookFiles.save({ sha256, blob });

		// The cover lives inside the EPUB — re-extract, like import does. The
		// recorded cover blob (if any) is only a fallback.
		const cover = await extractCover(await blob.arrayBuffer());
		if (cover) {
			await db.covers.save({ sha256, ...cover });
		} else if (book?.blossom?.coverSha256) {
			await downloadBlob(servers, book.blossom.coverSha256)
				.then((c) => db.covers.save({ sha256, blob: c.blob, mimeType: c.blob.type || 'image/jpeg' }))
				.catch(() => {});
		}

		// We just proved this server has the file — record it so the book stops
		// claiming it was never backed up (publishes on the next explicit sync).
		if (book && !book.blossom?.servers.includes(server)) {
			book.blossom = {
				servers: [...(book.blossom?.servers ?? []), server],
				coverSha256: book.blossom?.coverSha256
			};
			book.updatedAt = Date.now();
			await db.books.save(book);
			await checkDirty();
		}

		await library.refresh();
		toast.success(`Restored “${book?.title ?? sha256.slice(0, 8)}”`);
	} catch (err) {
		toast.error(err instanceof Error ? err.message : 'Restore failed');
	} finally {
		backingUp[sha256] = false;
	}
}

function reset(): void {
	syncing = false;
	backingUp = {};
	dirty = false;
	lastSynced = 0;
}

export const sync = {
	get syncing() {
		return syncing;
	},
	get dirty() {
		return dirty;
	},
	get lastSynced() {
		return lastSynced;
	},
	isBusy(sha256: string) {
		return backingUp[sha256] ?? false;
	},
	run,
	backupBook,
	restoreBook,
	checkDirty,
	reset
};
