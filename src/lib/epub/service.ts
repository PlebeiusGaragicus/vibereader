// The only module that touches epub.js. Live Book/Rendition objects are plain
// module state — never $state (proxies break them) — and every quirk of the
// (unmaintained) library is contained here so it stays swappable.

import ePub, { Book as EpubBook, EpubCFI, Rendition } from 'epubjs';
import { db } from '$lib/db/index.js';
import type { Annotation, HighlightColor } from '$lib/db/types.js';

export interface TocEntry {
	label: string;
	href: string;
	depth: number;
}

export interface SelectionInfo {
	cfiRange: string;
	text: string;
	/** Viewport (fixed-position) coords of the selection. */
	rect: DOMRect;
}

export interface ReadingSettings {
	fontSize: number; // px
	fontFamily: string; // CSS font-family, '' = publisher default
	lineHeight: number;
	theme: 'light' | 'dark' | 'sepia';
}

// Saturated marks + multiply blending reads well on all three reading themes.
export const HIGHLIGHT_COLORS: Record<HighlightColor, string> = {
	yellow: 'rgba(255, 224, 0, 0.45)',
	green: 'rgba(0, 216, 100, 0.4)',
	blue: 'rgba(60, 170, 250, 0.4)',
	pink: 'rgba(244, 114, 182, 0.45)',
	purple: 'rgba(168, 85, 247, 0.4)'
};
const NOTE_UNDERLINE = 'rgb(220, 38, 38)';

const READING_THEMES: Record<ReadingSettings['theme'], Record<string, Record<string, string>>> = {
	light: { body: { background: '#ffffff', color: '#1c1917' } },
	dark: { body: { background: '#18181b', color: '#d4d4d8' } },
	sepia: { body: { background: '#f4ecd8', color: '#5b4636' } }
};

let book: EpubBook | null = null;
let rendition: Rendition | null = null;
let currentSha: string | null = null;
let hasRendered = false;

let selectionCb: ((sel: SelectionInfo) => void) | null = null;
let markClickCb: ((id: string, rect: DOMRect | null) => void) | null = null;
let relocatedCb: ((loc: { cfi: string; href?: string; percentage?: number }) => void) | null =
	null;
let renderedCb: (() => void) | null = null;

function requireBook(): EpubBook {
	if (!book) throw new Error('No book open');
	return book;
}

export async function openBook(sha256: string): Promise<void> {
	destroy();
	const record = await db.bookFiles.get(sha256);
	if (!record) throw new Error('Book file missing from local storage');
	// epub.js MUST get an ArrayBuffer — handing it a URL makes it 404 fetching
	// internal archive paths.
	const buffer = await record.blob.arrayBuffer();
	book = ePub(buffer);
	currentSha = sha256;
	await book.ready;
}

export function renderTo(container: HTMLElement, settings: ReadingSettings): void {
	const b = requireBook();
	rendition = b.renderTo(container, {
		width: '100%',
		height: '100%',
		flow: 'paginated',
		spread: 'auto',
		allowScriptedContent: false
	});

	for (const [name, styles] of Object.entries(READING_THEMES)) {
		rendition.themes.register(name, styles);
	}
	applyDisplaySettings(settings);

	rendition.on('rendered', () => {
		const first = !hasRendered;
		hasRendered = true;
		if (first) renderedCb?.();
	});

	rendition.on('relocated', (location: { start: { cfi: string; href: string } }) => {
		const cfi = location.start.cfi;
		relocatedCb?.({
			cfi,
			href: location.start.href,
			percentage: percentageFromCfi(cfi)
		});
	});

	rendition.on('selected', (cfiRange: string, contents: EpubContents) => {
		const sel = contents.window.getSelection();
		if (!sel || sel.rangeCount === 0) return;
		const text = sel.toString().trim();
		if (!text) return;
		const rect = toViewportRect(sel.getRangeAt(0).getBoundingClientRect(), contents);
		if (rect) selectionCb?.({ cfiRange, text, rect });
	});

	rendition.on(
		'markClicked',
		(cfiRange: string, data: { id?: string } | undefined, contents: EpubContents) => {
			if (!data?.id) return;
			let rect: DOMRect | null = null;
			try {
				rect = toViewportRect(contents.range(cfiRange).getBoundingClientRect(), contents);
			} catch {
				// Positioning is best-effort; the sidebar path still works.
			}
			markClickCb?.(data.id, rect);
		}
	);
}

// epub.js Contents — typed loosely here; its shipped types miss what we use.
interface EpubContents {
	window: Window;
	range(cfi: string): Range;
}

/** Translate an in-iframe rect to viewport coords via the emitting iframe. */
function toViewportRect(rect: DOMRect, contents: EpubContents): DOMRect | null {
	const frame = contents.window.frameElement;
	if (!frame) return rect;
	const frameRect = frame.getBoundingClientRect();
	return new DOMRect(frameRect.left + rect.left, frameRect.top + rect.top, rect.width, rect.height);
}

export async function display(target?: string): Promise<void> {
	if (!rendition) return;
	// display(undefined) !== display() to epub.js — be explicit.
	if (target) await rendition.display(target);
	else await rendition.display();
}

export function next(): void {
	void rendition?.next();
}

export function prev(): void {
	void rendition?.prev();
}

export function getToc(): TocEntry[] {
	const b = requireBook();
	const entries: TocEntry[] = [];
	const walk = (items: { label: string; href: string; subitems?: unknown[] }[], depth: number) => {
		for (const item of items) {
			entries.push({ label: item.label.trim(), href: item.href, depth });
			if (item.subitems?.length) walk(item.subitems as typeof items, depth + 1);
		}
	};
	walk(b.navigation?.toc ?? [], 0);
	return entries;
}

export function sectionLabelFor(href: string | undefined): string | undefined {
	if (!href) return undefined;
	const plain = href.split('#')[0];
	return getToc().find((t) => t.href.split('#')[0] === plain)?.label;
}

// ---- locations (pagination cache) ----

let locationsReady = false;

export async function ensureLocations(): Promise<void> {
	const b = requireBook();
	const sha = currentSha!;
	locationsReady = false;
	const cached = await db.locations.get(sha);
	if (cached) {
		b.locations.load(cached.locationsJson);
	} else {
		await b.locations.generate(1024);
		// The book may have been closed while we generated.
		if (book !== b) return;
		await db.locations.save({
			sha256: sha,
			locationsJson: b.locations.save(),
			charsPerLocation: 1024,
			generatedAt: Date.now()
		});
	}
	if (book === b) locationsReady = true;
}

export function percentageFromCfi(cfi: string): number | undefined {
	if (!locationsReady || !book) return undefined;
	try {
		return book.locations.percentageFromCfi(cfi);
	} catch {
		return undefined;
	}
}

// ---- annotations ----

/** Never sort CFIs lexically — parse and compare properly. */
export function compareCfi(a: string, b: string): number {
	try {
		return new EpubCFI().compare(a, b);
	} catch {
		return 0;
	}
}

export function applyAnnotation(anno: Annotation): void {
	if (!rendition) return;
	if (anno.color) {
		rendition.annotations.add(
			'highlight',
			anno.cfiRange,
			{ id: anno.id },
			undefined,
			'vr-highlight',
			{
				fill: HIGHLIGHT_COLORS[anno.color],
				'fill-opacity': '1',
				'mix-blend-mode': 'multiply'
			}
		);
	} else {
		rendition.annotations.add(
			'underline',
			anno.cfiRange,
			{ id: anno.id },
			undefined,
			'vr-note-underline',
			{ stroke: NOTE_UNDERLINE, 'stroke-opacity': '0.9' }
		);
	}
}

export function removeAnnotation(anno: Annotation): void {
	if (!rendition) return;
	// Type must match what applyAnnotation used for this record.
	rendition.annotations.remove(anno.cfiRange, anno.color ? 'highlight' : 'underline');
}

// Other readers' shared highlights: dashed sky underline — read-only marks,
// visually distinct from own highlights (fill) and own notes (solid red).
const FOREIGN_UNDERLINE = 'rgb(14, 165, 233)';

export function applyForeignAnnotation(anno: { id: string; cfiRange: string }): void {
	if (!rendition || !hasRendered) return; // Pre-render add crashes epub.js.
	rendition.annotations.add(
		'underline',
		anno.cfiRange,
		{ id: anno.id, foreign: true },
		undefined,
		'vr-foreign-underline',
		{ stroke: FOREIGN_UNDERLINE, 'stroke-opacity': '0.8', 'stroke-dasharray': '3 2' }
	);
}

export function removeForeignAnnotation(anno: { cfiRange: string }): void {
	if (!rendition) return;
	rendition.annotations.remove(anno.cfiRange, 'underline');
}

export function clearSelection(): void {
	// epub.js keeps the selection inside the section iframe.
	if (!rendition) return;
	try {
		// @ts-expect-error getContents() is missing from the shipped types
		for (const contents of rendition.getContents() as EpubContents[]) {
			contents.window.getSelection()?.removeAllRanges();
		}
	} catch {
		// Best-effort.
	}
}

// ---- display settings ----

export function applyDisplaySettings(s: ReadingSettings): void {
	if (!rendition) return;
	rendition.themes.select(s.theme);
	rendition.themes.fontSize(`${s.fontSize}px`);
	if (s.fontFamily) rendition.themes.font(s.fontFamily);
	rendition.themes.override('line-height', String(s.lineHeight));
}

// ---- lifecycle & callbacks ----

export function onSelection(cb: typeof selectionCb): void {
	selectionCb = cb;
}
export function onMarkClick(cb: typeof markClickCb): void {
	markClickCb = cb;
}
export function onRelocated(cb: typeof relocatedCb): void {
	relocatedCb = cb;
}
/** Fires once, after the first section renders — the annotation-safe point. */
export function onFirstRendered(cb: typeof renderedCb): void {
	renderedCb = cb;
}

export function destroy(): void {
	try {
		book?.destroy();
	} catch {
		// epub.js can throw on double-destroy; we're discarding anyway.
	}
	book = null;
	rendition = null;
	currentSha = null;
	hasRendered = false;
	locationsReady = false;
	selectionCb = null;
	markClickCb = null;
	relocatedCb = null;
	renderedCb = null;
}
