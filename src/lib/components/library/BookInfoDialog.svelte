<script lang="ts">
	// Per-book status/diagnostics: metadata, identity, sync state, and a live
	// Blossom availability probe (HEAD <server>/<sha256>, no auth per BUD-01)
	// so "why can't I restore this?" is answerable without the console.
	import { CheckCircle2, CloudDownload, CloudUpload, Copy, Loader2, RefreshCw, X, XCircle } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { db } from '$lib/db/index.js';
	import { library } from '$lib/stores/library.svelte.js';
	import { settingsStore } from '$lib/stores/settings.svelte.js';
	import { sync } from '$lib/stores/sync.svelte.js';
	import { ui } from '$lib/stores/ui.svelte.js';

	let { sha256 }: { sha256: string } = $props();

	const book = $derived(library.books.find((b) => b.sha256 === sha256));
	const missing = $derived(library.missingFiles[sha256] ?? false);
	const cover = $derived(library.coverUrls[sha256]);
	const pct = $derived(library.progressBySha[sha256]);
	const busy = $derived(sync.isBusy(sha256));
	const backedUp = $derived(Boolean(book?.blossom?.servers.length));
	/** Recorded backup servers first, then the configured list — dedup'd. */
	const servers = $derived([
		...new Set([...(book?.blossom?.servers ?? []), ...settingsStore.settings.blossomServers])
	]);
	const synced = $derived(Boolean(book && sync.lastSynced >= book.updatedAt));

	let annotationCount = $state<number | null>(null);
	let probes = $state<Record<string, 'checking' | 'found' | 'missing' | 'unreachable'>>({});
	let confirmingBackup = $state(false);

	const anyFound = $derived(Object.values(probes).includes('found'));

	$effect(() => {
		if (!book) ui.infoSha = null; // Deleted while open.
	});

	$effect(() => {
		void db.annotations.getByBook(sha256).then((list) => (annotationCount = list.length));
		void sync.checkDirty(); // Populate lastSynced if no sync ran this session.
		void probe();
	});

	/** HEAD each server for this book's blob — the restore preflight. */
	async function probe(): Promise<void> {
		for (const server of servers) probes[server] = 'checking';
		await Promise.all(
			servers.map(async (server) => {
				try {
					const res = await fetch(`${server.replace(/\/$/, '')}/${sha256}`, { method: 'HEAD' });
					probes[server] = res.ok ? 'found' : 'missing';
				} catch {
					probes[server] = 'unreachable';
				}
			})
		);
	}

	function copySha(): void {
		void navigator.clipboard.writeText(sha256).then(() => toast.success('sha256 copied'));
	}

	function formatBytes(n: number): string {
		if (n < 1024) return `${n} B`;
		const units = ['KB', 'MB', 'GB'];
		let v = n;
		let i = -1;
		do {
			v /= 1024;
			i++;
		} while (v >= 1024 && i < units.length - 1);
		return `${v.toFixed(1)} ${units[i]}`;
	}

	function formatDate(ms: number | undefined): string {
		return ms ? new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
	}

	function close(): void {
		ui.infoSha = null;
	}
</script>

{#if book}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4"
		role="presentation"
		onmousedown={(e) => {
			if (e.target === e.currentTarget) close();
		}}
	>
		<div
			class="max-h-full w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
			role="dialog"
			aria-label="Book info"
		>
			<div class="mb-4 flex items-start justify-between gap-3">
				<div class="flex min-w-0 gap-3">
					{#if cover}
						<img src={cover} alt="" class="h-20 w-14 shrink-0 rounded object-cover" />
					{/if}
					<div class="min-w-0">
						<h2 class="text-lg leading-tight font-semibold">{book.title}</h2>
						<p class="truncate text-sm text-zinc-500">{book.creator}</p>
						{#if book.publisher || book.language}
							<p class="truncate text-xs text-zinc-500">
								{[book.publisher, book.language, book.isbn ? `ISBN ${book.isbn}` : '']
									.filter(Boolean)
									.join(' · ')}
							</p>
						{/if}
					</div>
				</div>
				<button class="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800" title="Close" onclick={close}>
					<X class="size-4" />
				</button>
			</div>

			<h3 class="mb-1 text-sm font-medium">On this device</h3>
			<dl class="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
				<dt class="text-zinc-500">File</dt>
				<dd class={missing ? 'text-red-500' : ''}>
					{missing ? 'Missing — metadata only' : formatBytes(book.fileSize)}
				</dd>
				<dt class="text-zinc-500">Progress</dt>
				<dd>{pct !== undefined ? `${Math.round(pct * 100)}%` : 'Not started'}</dd>
				<dt class="text-zinc-500">Annotations</dt>
				<dd>{annotationCount ?? '…'}</dd>
				<dt class="text-zinc-500">Added</dt>
				<dd>{formatDate(book.addedAt)}</dd>
				<dt class="text-zinc-500">Last opened</dt>
				<dd>{formatDate(book.lastOpenedAt)}</dd>
			</dl>

			<h3 class="mb-1 text-sm font-medium">Identity</h3>
			<div class="mb-4 flex items-center gap-1.5">
				<code class="min-w-0 truncate rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">
					{sha256}
				</code>
				<button
					class="shrink-0 rounded p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
					title="Copy sha256"
					onclick={copySha}
				>
					<Copy class="size-3.5" />
				</button>
			</div>

			<h3 class="mb-1 text-sm font-medium">Sync</h3>
			<dl class="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
				<dt class="text-zinc-500">Metadata</dt>
				<dd class={synced ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-500'}>
					{synced ? 'Synced to relays' : 'Changed since last sync'}
				</dd>
				<dt class="text-zinc-500">Last sync</dt>
				<dd>{sync.lastSynced ? formatDate(sync.lastSynced) : 'Never (this session)'}</dd>
			</dl>

			<div class="mb-1 flex items-center justify-between">
				<h3 class="text-sm font-medium">Blossom backup</h3>
				<button
					class="rounded p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
					title="Re-check availability"
					onclick={() => void probe()}
				>
					<RefreshCw class="size-3.5" />
				</button>
			</div>
			{#if !backedUp}
				<p class="mb-2 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-400">
					No backup recorded — this book's file has never been uploaded to a Blossom server (the
					global Sync only carries metadata; file backup is per-book).
					{#if missing}
						Restoring on this device needs a device that still has the file to Back up, then Sync.
					{/if}
				</p>
			{/if}
			<ul class="mb-3 space-y-1 text-sm">
				{#each servers as server (server)}
					<li class="flex items-center gap-2">
						{#if probes[server] === 'checking'}
							<Loader2 class="size-3.5 shrink-0 animate-spin text-zinc-400" />
						{:else if probes[server] === 'found'}
							<CheckCircle2 class="size-3.5 shrink-0 text-emerald-500" />
						{:else}
							<XCircle class="size-3.5 shrink-0 text-red-400" />
						{/if}
						<span class="min-w-0 truncate">{server.replace(/^https?:\/\//, '')}</span>
						<span class="ml-auto shrink-0 text-xs text-zinc-500">
							{#if probes[server] === 'found'}
								has file{book.blossom?.servers.includes(server) ? '' : ' (unrecorded)'}
							{:else if probes[server] === 'missing'}
								{book.blossom?.servers.includes(server) ? 'backup gone!' : 'no file'}
							{:else if probes[server] === 'unreachable'}
								unreachable
							{/if}
						</span>
					</li>
				{/each}
			</ul>

			{#if confirmingBackup}
				<div class="rounded-lg bg-zinc-100 p-3 dark:bg-zinc-800">
					<p class="mb-2 text-xs">
						Blobs are <strong>publicly fetchable</strong> by anyone who knows the file's hash — only
						back up books you have the right to share.
					</p>
					<div class="flex gap-2">
						<button
							class="rounded bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-500"
							onclick={() => {
								confirmingBackup = false;
								void sync.backupBook(sha256).then(() => probe());
							}}
						>
							Back up
						</button>
						<button
							class="rounded bg-zinc-300 px-2.5 py-1 text-xs font-medium hover:bg-zinc-400 dark:bg-zinc-700 dark:hover:bg-zinc-600"
							onclick={() => (confirmingBackup = false)}
						>
							Cancel
						</button>
					</div>
				</div>
			{:else}
				<div class="flex gap-2">
					{#if !missing}
						<button
							class="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50"
							disabled={busy}
							onclick={() => (confirmingBackup = true)}
						>
							{#if busy}
								<Loader2 class="size-3.5 animate-spin" />
							{:else}
								<CloudUpload class="size-3.5" />
							{/if}
							{backedUp ? 'Back up again' : 'Back up file'}
						</button>
					{:else if anyFound}
						<button
							class="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50"
							disabled={busy}
							onclick={() => void sync.restoreBook(sha256).then(() => probe())}
						>
							{#if busy}
								<Loader2 class="size-3.5 animate-spin" />
							{:else}
								<CloudDownload class="size-3.5" />
							{/if}
							Restore file
						</button>
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/if}
