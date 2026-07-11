// The open-book reading session: orchestrates the epub service lifecycle,
// progress autosave/resume, and TOC state. UI-serializable state only —
// the live epub.js objects stay inside the service.

import { db } from '$lib/db/index.js';
import type { Book } from '$lib/db/types.js';
import * as epub from '$lib/epub/service.js';
import type { TocEntry } from '$lib/epub/service.js';
import { debounce } from '$lib/utils.js';
import { annotations } from './annotations.svelte.js';
import { library } from './library.svelte.js';
import { selection } from './selection.svelte.js';
import { settingsStore } from './settings.svelte.js';
import { ui } from './ui.svelte.js';

let book = $state<Book | null>(null);
let toc = $state<TocEntry[]>([]);
let location = $state<{ cfi: string; sectionHref?: string; sectionLabel?: string } | null>(null);
let percentage = $state<number | undefined>(undefined);
let bookReady = $state(false);

const saveProgress = debounce((cfi: string, pct: number | undefined, href?: string) => {
	const sha = book?.sha256;
	if (!sha) return;
	void db.progress.save({
		sha256: sha,
		cfi,
		percentage: pct ?? 0,
		sectionHref: href,
		updatedAt: Date.now()
	});
}, 1000);

async function open(record: Book): Promise<void> {
	close();
	book = record;
	ui.view = 'reader';

	await epub.openBook(record.sha256);
	toc = epub.getToc();
	await annotations.load(record.sha256);

	epub.onFirstRendered(() => annotations.applyToRendition());
	epub.onRelocated((loc) => {
		location = {
			cfi: loc.cfi,
			sectionHref: loc.href,
			sectionLabel: epub.sectionLabelFor(loc.href)
		};
		percentage = loc.percentage;
		selection.clear();
		if (book) library.noteProgress(book.sha256, loc.percentage);
		saveProgress(loc.cfi, loc.percentage, loc.href);
	});
	epub.onSelection((sel) => selection.set(sel));
	epub.onMarkClick((id, rect) => selection.edit(id, rect));

	bookReady = true;

	record.lastOpenedAt = Date.now();
	void db.books.save($state.snapshot(record) as Book);
}

/** Called by EpubViewer once its container element exists. */
async function attach(container: HTMLElement): Promise<void> {
	if (!book) return;
	epub.renderTo(container, settingsStore.settings.reading);
	const progress = await db.progress.get(book.sha256);
	await epub.display(progress?.cfi);
	// Pagination locations generate in the background; % fills in when ready.
	void epub.ensureLocations().then(() => {
		if (location) percentage = epub.percentageFromCfi(location.cfi);
	});
}

function close(): void {
	saveProgress.cancel();
	if (location && book) {
		void db.progress.save({
			sha256: book.sha256,
			cfi: location.cfi,
			percentage: percentage ?? 0,
			sectionHref: location.sectionHref,
			updatedAt: Date.now()
		});
	}
	epub.destroy();
	annotations.reset();
	selection.clear();
	book = null;
	toc = [];
	location = null;
	percentage = undefined;
	bookReady = false;
	ui.view = 'library';
	ui.tocOpen = false;
	ui.annotationsOpen = false;
	ui.chatOpen = false;
}

export const reader = {
	get book() {
		return book;
	},
	get toc() {
		return toc;
	},
	get location() {
		return location;
	},
	get percentage() {
		return percentage;
	},
	get bookReady() {
		return bookReady;
	},
	open,
	attach,
	close,
	next: epub.next,
	prev: epub.prev,
	display: epub.display,
	applyDisplaySettings: epub.applyDisplaySettings
};
