// The explicit sync engine: one naive REQ pull, per-record LWW merge (with
// tombstones), then push everything the relay doesn't have the newest copy
// of. Only ever runs from an explicit user action.

import { cyphertap, type SimpleNostrEvent } from 'cyphertap';
import { db } from '$lib/db/index.js';
import type { Annotation, Book, ReadingProgress } from '$lib/db/types.js';
import type { ReadingSettings } from '$lib/epub/service.js';
import {
	annotationDraft,
	bookDraft,
	dedupeByAddress,
	isbnTags,
	parseRemote,
	progressDraft,
	settingsDraft,
	tombstoneDraft,
	type AddressableDraft
} from './events.js';
import {
	KIND_ANNOTATION,
	KIND_BOOK,
	KIND_DELETE,
	KIND_PROGRESS,
	KIND_SETTINGS,
	SETTINGS_D_TAG
} from './kinds.js';

export interface SyncSummary {
	pushed: number;
	pulled: number;
	deletedLocally: number;
	restorableBooks: string[]; // sha256s pulled whose file bytes are missing locally
}

export interface SyncCallbacks {
	readingSettings: () => { reading: ReadingSettings; updatedAt: number };
	applyRemoteReading: (reading: ReadingSettings, updatedAt: number) => void;
}

const LAST_SYNC_KEY = 'last-sync-at';

export async function syncNow(relays: string[], callbacks: SyncCallbacks): Promise<SyncSummary> {
	const me = cyphertap.getUserHex();
	if (!me) throw new Error('Not logged in');

	// ---- pull ----
	const raw = await cyphertap.fetchEvents({
		kinds: [KIND_BOOK, KIND_PROGRESS, KIND_SETTINGS, KIND_ANNOTATION],
		authors: [me]
	});
	const remoteEvents = dedupeByAddress(raw);

	// Remote knowledge per (kind, d): newest updatedAt seen, so push can skip
	// anything the relay already has current.
	const remoteUpdatedAt = new Map<string, number>();
	const summary: SyncSummary = { pushed: 0, pulled: 0, deletedLocally: 0, restorableBooks: [] };

	const [localBooks, localProgress, localAnnotations, tombstones] = await Promise.all([
		db.books.getAll(),
		db.progress.getAll(),
		db.annotations.getAll(),
		db.tombstones.getAll()
	]);
	const bookBySha = new Map(localBooks.map((b) => [b.sha256, b]));
	const progressBySha = new Map(localProgress.map((p) => [p.sha256, p]));
	const annotationById = new Map(localAnnotations.map((a) => [a.id, a]));
	const tombstoneByKey = new Map(tombstones.map((t) => [t.key, t]));

	for (const event of remoteEvents) {
		const parsed = await parseRemote(event as SimpleNostrEvent);
		if (!parsed) continue;
		const key = `${parsed.kind}:${parsed.d}`;
		remoteUpdatedAt.set(key, parsed.updatedAt);

		const localTomb = tombstoneByKey.get(key);
		if (localTomb && localTomb.deletedAt >= parsed.updatedAt) continue; // We deleted it more recently.

		if (parsed.deleted) {
			// Remote tombstone — apply if it beats our local copy.
			const applied = await applyRemoteDelete(parsed.kind, parsed.d, parsed.updatedAt, {
				bookBySha,
				annotationById
			});
			if (applied) summary.deletedLocally++;
			continue;
		}

		switch (parsed.kind) {
			case KIND_BOOK: {
				const local = bookBySha.get(parsed.d);
				if (!local || parsed.updatedAt > local.updatedAt) {
					const book: Book = { ...parsed.book!, sha256: parsed.d, lastOpenedAt: local?.lastOpenedAt };
					await db.books.save(book);
					bookBySha.set(parsed.d, book);
					summary.pulled++;
					if (!(await db.bookFiles.get(parsed.d))) summary.restorableBooks.push(parsed.d);
				}
				break;
			}
			case KIND_PROGRESS: {
				const local = progressBySha.get(parsed.d);
				if (!local || parsed.updatedAt > local.updatedAt) {
					const progress: ReadingProgress = { ...parsed.progress!, sha256: parsed.d };
					await db.progress.save(progress);
					progressBySha.set(parsed.d, progress);
					summary.pulled++;
				}
				break;
			}
			case KIND_SETTINGS: {
				if (parsed.reading && parsed.updatedAt > callbacks.readingSettings().updatedAt) {
					callbacks.applyRemoteReading(parsed.reading, parsed.updatedAt);
					summary.pulled++;
				}
				break;
			}
			case KIND_ANNOTATION: {
				const local = annotationById.get(parsed.d);
				if (!local || parsed.updatedAt > local.updatedAt) {
					const annotation: Annotation = { ...parsed.annotation!, id: parsed.d };
					await db.annotations.save(annotation);
					annotationById.set(parsed.d, annotation);
					summary.pulled++;
				}
				break;
			}
		}
	}

	// ---- push ----
	const drafts: AddressableDraft[] = [];
	for (const book of bookBySha.values()) drafts.push(await bookDraft(book));
	for (const progress of progressBySha.values()) drafts.push(await progressDraft(progress));
	for (const anno of annotationById.values()) {
		const draft = await annotationDraft(anno);
		if (anno.shared) draft.tags.push(...isbnTags(bookBySha.get(anno.sha256)));
		drafts.push(draft);
	}
	const settingsState = callbacks.readingSettings();
	if (settingsState.updatedAt > 0) {
		drafts.push(await settingsDraft(settingsState.reading, settingsState.updatedAt));
	}
	for (const tomb of tombstoneByKey.values()) drafts.push(await tombstoneDraft(tomb));

	const deletedAddresses: string[] = [];
	for (const draft of drafts) {
		const key = `${draft.kind}:${draft.d}`;
		const remote = remoteUpdatedAt.get(key) ?? 0;
		if (draft.updatedAt <= remote) continue; // Relay already current.
		await cyphertap.publishEvent(
			{ kind: draft.kind, content: draft.content, tags: [['d', draft.d], ...draft.tags] },
			{ relays }
		);
		summary.pushed++;
		if (tombstoneByKey.has(key)) deletedAddresses.push(`${draft.kind}:${me}:${draft.d}`);
	}

	// NIP-09 bonus cleanup for freshly-pushed tombstones (not load-bearing).
	if (deletedAddresses.length) {
		await cyphertap
			.publishEvent(
				{
					kind: KIND_DELETE,
					content: '',
					tags: [
						...deletedAddresses.map((a) => ['a', a]),
						...[...new Set(deletedAddresses.map((a) => a.split(':')[0]))].map((k) => ['k', k])
					]
				},
				{ relays }
			)
			.catch(() => {});
	}

	await db.kv.save(LAST_SYNC_KEY, Date.now());
	return summary;
}

async function applyRemoteDelete(
	kind: number,
	d: string,
	deletedAt: number,
	locals: { bookBySha: Map<string, Book>; annotationById: Map<string, Annotation> }
): Promise<boolean> {
	if (kind === KIND_ANNOTATION) {
		const local = locals.annotationById.get(d);
		await db.tombstones.save({ key: `${kind}:${d}`, kind, d, deletedAt });
		if (local && local.updatedAt < deletedAt) {
			await db.annotations.delete(d); // Also re-tombstones locally; ours is older, theirs stands.
			await db.tombstones.save({ key: `${kind}:${d}`, kind, d, deletedAt });
			locals.annotationById.delete(d);
			return true;
		}
		return false;
	}
	if (kind === KIND_BOOK) {
		const local = locals.bookBySha.get(d);
		await db.tombstones.save({ key: `${kind}:${d}`, kind, d, deletedAt });
		if (local && local.updatedAt < deletedAt) {
			await db.books.delete(d);
			await db.tombstones.save({ key: `${kind}:${d}`, kind, d, deletedAt });
			locals.bookBySha.delete(d);
			return true;
		}
		return false;
	}
	if (kind === KIND_PROGRESS || kind === KIND_SETTINGS) {
		// Progress/settings tombstones only ever ride along with book deletion;
		// record them so we don't re-push stale state.
		await db.tombstones.save({ key: `${kind}:${d}`, kind, d, deletedAt });
		return false;
	}
	return false;
}

export async function lastSyncAt(): Promise<number> {
	return (await db.kv.get<number>(LAST_SYNC_KEY)) ?? 0;
}

export { SETTINGS_D_TAG };
