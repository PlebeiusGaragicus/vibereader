// Login/logout lifecycle: bridges the cyphertap identity to the per-npub
// database and the per-user stores. +page.svelte's $effect drives start/stop.

import { closeUserDB, setCurrentUser } from '$lib/db/index.js';
import { library } from './library.svelte.js';
import { reader } from './reader.svelte.js';
import { sync } from './sync.svelte.js';
import { ui } from './ui.svelte.js';

let activeNpub = $state<string | null>(null);

async function start(npub: string): Promise<void> {
	if (activeNpub === npub) return;
	if (activeNpub) stop();
	activeNpub = npub;
	setCurrentUser(npub);

	// Ask the browser not to evict our IndexedDB under storage pressure.
	// Chromium usually grants it silently; Safari ignores it for plain web
	// apps — Blossom backup (Phase D) is the durable answer there.
	try {
		await navigator.storage?.persist?.();
	} catch {
		// Not fatal — persistence is best-effort.
	}

	await library.init();
	await sync.checkDirty();
}

function stop(): void {
	if (reader.book) reader.close();
	library.reset();
	sync.reset();
	ui.reset();
	closeUserDB();
	activeNpub = null;
}

export const session = {
	get activeNpub() {
		return activeNpub;
	},
	start,
	stop
};
