// The active text selection inside the book (feeds the context menu), plus
// the "editing an existing annotation" popover state from mark clicks.

import type { SelectionInfo } from '$lib/epub/service.js';

let active = $state<SelectionInfo | null>(null);
let editingId = $state<string | null>(null);
let editingRect = $state<DOMRect | null>(null);

export const selection = {
	get active() {
		return active;
	},
	get editingId() {
		return editingId;
	},
	get editingRect() {
		return editingRect;
	},
	set(sel: SelectionInfo) {
		editingId = null;
		editingRect = null;
		active = sel;
	},
	edit(id: string, rect: DOMRect | null) {
		active = null;
		editingId = id;
		editingRect = rect;
	},
	clear() {
		active = null;
		editingId = null;
		editingRect = null;
	}
};
