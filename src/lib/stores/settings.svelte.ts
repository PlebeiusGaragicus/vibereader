// Device preferences: localStorage (not IndexedDB, not synced — the AI
// endpoint config in particular never leaves this browser). A gitignored
// .env pre-fills the AI form in dev; the hosted build ships credential-free.

import type { ReadingSettings } from '$lib/epub/service.js';

const STORAGE_KEY = 'vibereader-settings';

export interface AiSettings {
	baseUrl: string;
	apiKey: string;
	model: string;
	streaming: boolean;
}

export interface Settings {
	ai: AiSettings;
	reading: ReadingSettings;
}

function envDefaults(): Settings {
	return {
		ai: {
			baseUrl: import.meta.env.VITE_AI_BASE_URL ?? '',
			apiKey: import.meta.env.VITE_AI_API_KEY ?? '',
			model: import.meta.env.VITE_AI_MODEL ?? '',
			streaming: true
		},
		reading: { fontSize: 18, fontFamily: '', lineHeight: 1.6, theme: 'light' }
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
			reading: { ...defaults.reading, ...saved.reading }
		};
	} catch {
		return defaults;
	}
}

let current = $state<Settings>(load());

const isAiConfigured = $derived(Boolean(current.ai.baseUrl && current.ai.model));

function save(patch: Partial<Settings>): void {
	if (patch.ai) current.ai = { ...current.ai, ...patch.ai };
	if (patch.reading) current.reading = { ...current.reading, ...patch.reading };
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
	save
};
