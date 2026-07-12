// Other readers' shared highlights for the OPEN book — multi-perspective
// reading. Explicitly fetched (never automatic), read-only, session-memory
// only; marks render as dashed underlines, toggleable per person.

import { toast } from 'svelte-sonner';
import { cyphertap } from 'cyphertap';
import type { Annotation } from '$lib/db/types.js';
import * as epub from '$lib/epub/service.js';
import { dedupeByAddress, parseForeign } from '$lib/nostr/events.js';
import { KIND_ANNOTATION } from '$lib/nostr/kinds.js';

export interface ForeignReader {
	hex: string;
	name?: string;
	annotations: Annotation[]; // spine-sorted
	shown: boolean;
}

let readers = $state<ForeignReader[]>([]);
let loaded = $state(false);
let loading = $state(false);
let bookSha: string | null = null;

/** One explicit `#x` query: everyone's shared annotations on this book. */
async function fetchForBook(sha256: string): Promise<void> {
	if (loading) return;
	loading = true;
	bookSha = sha256;
	try {
		const events = await cyphertap.fetchEvents({ kinds: [KIND_ANNOTATION], '#x': [sha256] });
		const me = cyphertap.getUserHex();
		const byReader = new Map<string, Annotation[]>();
		for (const event of dedupeByAddress(events)) {
			if (event.pubkey === me) continue;
			const parsed = parseForeign(event);
			if (!parsed || parsed.kind !== KIND_ANNOTATION) continue;
			const anno = { id: parsed.id, ...parsed.annotation } as Annotation;
			if (anno.sha256 !== sha256) continue;
			const list = byReader.get(event.pubkey) ?? [];
			list.push(anno);
			byReader.set(event.pubkey, list);
		}

		// Names are cosmetic; failures keep the bare hex.
		const names = new Map<string, string>();
		if (byReader.size) {
			try {
				const profiles = await cyphertap.fetchEvents({ kinds: [0], authors: [...byReader.keys()] });
				for (const ev of profiles) {
					try {
						const meta = JSON.parse(ev.content) as Record<string, unknown>;
						const name =
							(typeof meta.display_name === 'string' && meta.display_name) ||
							(typeof meta.name === 'string' && meta.name);
						if (name && !names.has(ev.pubkey)) names.set(ev.pubkey, name);
					} catch {
						// skip
					}
				}
			} catch {
				// skip
			}
		}

		readers = [...byReader]
			.map(([hex, annotations]) => ({
				hex,
				name: names.get(hex),
				annotations: annotations.sort((a, b) => epub.compareCfi(a.cfiRange, b.cfiRange)),
				shown: false
			}))
			.sort((a, b) => b.annotations.length - a.annotations.length);
		loaded = true;
	} catch (err) {
		console.error(err);
		toast.error('Could not load other readers’ highlights');
	} finally {
		loading = false;
	}
}

function toggle(hex: string): void {
	const reader = readers.find((r) => r.hex === hex);
	if (!reader) return;
	reader.shown = !reader.shown;
	for (const anno of reader.annotations) {
		if (reader.shown) epub.applyForeignAnnotation(anno);
		else epub.removeForeignAnnotation(anno);
	}
}

function reset(): void {
	// Marks die with the rendition — no need to remove them one by one.
	readers = [];
	loaded = false;
	loading = false;
	bookSha = null;
}

export const foreignAnnotations = {
	get readers() {
		return readers;
	},
	get loaded() {
		return loaded;
	},
	get loading() {
		return loading;
	},
	get bookSha() {
		return bookSha;
	},
	fetchForBook,
	toggle,
	reset
};
