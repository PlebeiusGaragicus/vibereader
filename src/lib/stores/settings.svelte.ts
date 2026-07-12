// Device preferences: localStorage (not IndexedDB, not synced — the AI
// endpoint config in particular never leaves this browser). A gitignored
// .env pre-fills the AI form in dev; the hosted build ships credential-free.

import type { ReadingSettings } from '$lib/epub/service.js';
import { RELAYS } from '$lib/relays.js';

const STORAGE_KEY = 'vibereader-settings';
// The only public server found (2026-07) that BOTH allows browser-CORS
// uploads AND accepts application/epub+zip — most Blossom servers are
// media CDNs (primal/v0l block CORS; band/nostrcheck/f7z reject the MIME).
// Running your own Blossom server is the recommended path; add it in Settings.
const DEFAULT_BLOSSOM_SERVERS = ['https://nostr.download'];

export interface AiSettings {
	baseUrl: string;
	apiKey: string;
	model: string;
	streaming: boolean;
}

export interface Settings {
	ai: AiSettings;
	reading: ReadingSettings;
	/** When `reading` last changed — drives the 30103 sync merge. */
	readingUpdatedAt: number;
	/** Sync targets (device preference; seeded from defaults). */
	relays: string[];
	blossomServers: string[];
}

function envDefaults(): Settings {
	return {
		ai: {
			baseUrl: import.meta.env.VITE_AI_BASE_URL ?? '',
			apiKey: import.meta.env.VITE_AI_API_KEY ?? '',
			model: import.meta.env.VITE_AI_MODEL ?? '',
			streaming: true
		},
		reading: { fontSize: 18, fontFamily: '', lineHeight: 1.6, theme: 'light' },
		readingUpdatedAt: 0,
		relays: [...RELAYS],
		blossomServers: [...DEFAULT_BLOSSOM_SERVERS]
	};
}

function load(): Settings {
	const defaults = envDefaults();
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return defaults;
		const saved = JSON.parse(raw) as Partial<Settings>;
		return {
			ai: { ...defaults.ai, ...saved.ai },
			reading: { ...defaults.reading, ...saved.reading },
			readingUpdatedAt: saved.readingUpdatedAt ?? 0,
			relays: saved.relays?.length ? saved.relays : defaults.relays,
			blossomServers: saved.blossomServers?.length ? saved.blossomServers : defaults.blossomServers
		};
	} catch {
		return defaults;
	}
}

let current = $state<Settings>(load());

const isAiConfigured = $derived(Boolean(current.ai.baseUrl && current.ai.model));

function save(patch: Partial<Settings>): void {
	if (patch.ai) current.ai = { ...current.ai, ...patch.ai };
	if (patch.reading) {
		current.reading = { ...current.reading, ...patch.reading };
		current.readingUpdatedAt = Date.now();
	}
	if (patch.relays) current.relays = patch.relays;
	if (patch.blossomServers) current.blossomServers = patch.blossomServers;
	persist();
}

/** Sync pull found newer reading settings on the relay — apply without re-stamping. */
function applyRemoteReading(reading: ReadingSettings, updatedAt: number): void {
	current.reading = reading;
	current.readingUpdatedAt = updatedAt;
	persist();
}

function persist(): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
	} catch {
		// Quota/private-mode failures shouldn't break the session.
	}
}

export const settingsStore = {
	get settings() {
		return current;
	},
	get isAiConfigured() {
		return isAiConfigured;
	},
	save,
	applyRemoteReading
};
