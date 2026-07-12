// Annotations for the open book: the unified highlight/note primitive.
// Owns persistence + the bridge to the rendition's mark layer. Records
// mirror kind-30104 event content 1:1 (docs/nostr-event-model.md).

import { nanoid } from 'nanoid';
import { toast } from 'svelte-sonner';
import { cyphertap } from 'cyphertap';
import { db } from '$lib/db/index.js';
import type { Annotation, HighlightColor } from '$lib/db/types.js';
import * as epub from '$lib/epub/service.js';
import { annotationDraft, highlightExport, isbnTags } from '$lib/nostr/events.js';
import { settingsStore } from './settings.svelte.js';

let items = $state<Annotation[]>([]);
let bookSha: string | null = null;
let applied = false;

const sorted = $derived([...items].sort((a, b) => epub.compareCfi(a.cfiRange, b.cfiRange)));

async function load(sha256: string): Promise<void> {
	bookSha = sha256;
	applied = false;
	items = await db.annotations.getByBook(sha256);
}

/** Bridge all records into the rendition — call only after first `rendered`. */
function applyToRendition(): void {
	if (applied) return;
	applied = true;
	for (const anno of items) epub.applyAnnotation(anno);
}

async function create(input: {
	cfiRange: string;
	quote: string;
	color?: HighlightColor;
	note?: string;
}): Promise<Annotation> {
	if (!bookSha) throw new Error('No book open');
	const now = Date.now();
	const anno: Annotation = {
		id: `anno-${nanoid()}`,
		sha256: bookSha,
		...input,
		createdAt: now,
		updatedAt: now
	};
	items.push(anno);
	if (applied) epub.applyAnnotation(anno);
	await db.annotations.save(anno);
	return anno;
}

async function update(
	id: string,
	patch: Partial<Pick<Annotation, 'color' | 'note'>>
): Promise<void> {
	const anno = items.find((a) => a.id === id);
	if (!anno) return;
	// Mark type/style may change — remove under the OLD shape first.
	if (applied) epub.removeAnnotation(anno);
	if ('color' in patch) anno.color = patch.color;
	if ('note' in patch) anno.note = patch.note;
	anno.updatedAt = Date.now();
	if (!anno.color && !anno.note) {
		// An annotation with neither color nor note is nothing — delete it.
		items = items.filter((a) => a.id !== id);
		await db.annotations.delete(id);
		return;
	}
	if (applied) epub.applyAnnotation(anno);
	await db.annotations.save(anno);
}

async function remove(id: string): Promise<void> {
	const anno = items.find((a) => a.id === id);
	if (!anno) return;
	if (applied) epub.removeAnnotation(anno);
	items = items.filter((a) => a.id !== id);
	await db.annotations.delete(id);
}

async function goTo(id: string): Promise<void> {
	const anno = items.find((a) => a.id === id);
	if (anno) await epub.display(anno.cfiRange);
}

/**
 * Flip an annotation public (or back to private) and publish immediately —
 * the click IS the explicit relay action. Public = the same 30104 in
 * plaintext with query tags; optionally also an immutable NIP-84 9802.
 */
async function setShared(id: string, shared: boolean, exportHighlight = false): Promise<void> {
	const anno = items.find((a) => a.id === id);
	if (!anno || !bookSha) return;
	anno.shared = shared;
	anno.updatedAt = Date.now();
	await db.annotations.save($state.snapshot(anno) as Annotation);

	try {
		const book = await db.books.get(bookSha);
		const draft = await annotationDraft($state.snapshot(anno) as Annotation);
		if (shared) draft.tags.push(...isbnTags(book));
		await cyphertap.publishEvent(
			{ kind: draft.kind, content: draft.content, tags: [['d', draft.d], ...draft.tags] },
			{ relays: settingsStore.settings.relays }
		);
		if (shared && exportHighlight && book) {
			await cyphertap.publishEvent(highlightExport($state.snapshot(anno) as Annotation, book), {
				relays: settingsStore.settings.relays
			});
		}
		toast.success(shared ? 'Annotation published' : 'Annotation made private again');
	} catch (err) {
		console.error(err);
		toast.error('Publish failed — the change is saved locally and will ride the next sync');
	}
}

function reset(): void {
	items = [];
	bookSha = null;
	applied = false;
}

export const annotations = {
	get all() {
		return sorted;
	},
	byId(id: string) {
		return items.find((a) => a.id === id);
	},
	load,
	applyToRendition,
	create,
	update,
	remove,
	goTo,
	setShared,
	reset
};
