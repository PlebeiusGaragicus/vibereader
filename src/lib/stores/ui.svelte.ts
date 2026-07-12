// App-level view state (which screen, which sidebars). Per-book reading
// state lives in the reader/annotations stores, not here.

let view = $state<'library' | 'reader'>('library');
let tocOpen = $state(false);
let annotationsOpen = $state(false);
let chatOpen = $state(false);
let settingsOpen = $state(false);
let infoSha = $state<string | null>(null);

export const ui = {
	get view() {
		return view;
	},
	set view(v: 'library' | 'reader') {
		view = v;
	},
	get tocOpen() {
		return tocOpen;
	},
	set tocOpen(v: boolean) {
		tocOpen = v;
	},
	get annotationsOpen() {
		return annotationsOpen;
	},
	set annotationsOpen(v: boolean) {
		annotationsOpen = v;
	},
	get chatOpen() {
		return chatOpen;
	},
	set chatOpen(v: boolean) {
		chatOpen = v;
	},
	get settingsOpen() {
		return settingsOpen;
	},
	set settingsOpen(v: boolean) {
		settingsOpen = v;
	},
	get infoSha() {
		return infoSha;
	},
	set infoSha(v: string | null) {
		infoSha = v;
	},
	reset() {
		view = 'library';
		tocOpen = false;
		annotationsOpen = false;
		chatOpen = false;
		settingsOpen = false;
		infoSha = null;
	}
};
