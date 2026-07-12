<script lang="ts">
	// Read-only window into other users' public shelves: shared 30101 books +
	// shared 30104 annotations. See docs/nostr-event-model.md.
	import {
		ArrowLeft,
		BookOpen,
		CloudDownload,
		Globe,
		Loader2,
		Search,
		StickyNote,
		Users
	} from '@lucide/svelte';
	import { HIGHLIGHT_COLORS } from '$lib/epub/service.js';
	import { browse } from '$lib/stores/browse.svelte.js';
	import { ui } from '$lib/stores/ui.svelte.js';

	let npubInput = $state('');
	let expandedSha = $state<string | null>(null);

	function back(): void {
		if (browse.mode !== 'start') browse.mode = 'start';
		else ui.view = 'library';
	}

	function displayName(p: { hex: string; name?: string }): string {
		return p.name ?? browse.shortNpub(p.hex);
	}
</script>

<div class="flex h-full flex-col">
	<div class="flex items-center gap-2 border-b border-zinc-200 px-3 py-1.5 dark:border-zinc-800">
		<button
			class="rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
			title="Back"
			onclick={back}
		>
			<ArrowLeft class="size-4" />
		</button>
		<div class="min-w-0 flex-1 text-center">
			<span class="truncate text-sm font-medium">
				{#if browse.mode === 'shelf' && browse.target}
					{displayName(browse.target)}'s shelf
				{:else if browse.mode === 'readers' && browse.readersBook}
					Readers of “{browse.readersBook.title}”
				{:else}
					Browse libraries
				{/if}
			</span>
		</div>
		<span class="w-6"></span>
	</div>

	<div class="min-h-0 flex-1 overflow-y-auto">
		<div class="mx-auto max-w-2xl p-6">
			{#if browse.loading}
				<div class="flex justify-center py-16">
					<Loader2 class="size-6 animate-spin text-zinc-400" />
				</div>
			{:else if browse.mode === 'start'}
				<p class="mb-3 text-sm text-zinc-500">
					See what someone has chosen to share: their public shelf and public annotations.
					Browsing is read-only and publishes nothing.
				</p>
				<form
					class="mb-6 flex gap-2"
					onsubmit={(e) => {
						e.preventDefault();
						if (npubInput.trim()) void browse.browseUser(npubInput);
					}}
				>
					<input
						class="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-transparent px-2.5 py-1.5 font-mono text-sm focus:outline-none dark:border-zinc-700"
						placeholder="npub1…"
						bind:value={npubInput}
					/>
					<button
						class="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
						disabled={!npubInput.trim()}
						type="submit"
					>
						<Search class="size-4" /> Browse
					</button>
				</form>

				<h3 class="mb-2 flex items-center gap-1.5 text-sm font-semibold text-zinc-500">
					<Users class="size-4" /> Your follows
				</h3>
				{#if browse.follows === null}
					<div class="flex justify-center py-8">
						<Loader2 class="size-5 animate-spin text-zinc-400" />
					</div>
				{:else if browse.follows.length === 0}
					<p class="py-6 text-center text-sm text-zinc-500">
						No follows found on your relays — paste an npub above instead.
					</p>
				{:else}
					<div class="flex flex-col gap-1">
						{#each browse.follows as follow (follow.hex)}
							<button
								class="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
								onclick={() => void browse.browseUser(follow.hex)}
							>
								{#if follow.picture}
									<img src={follow.picture} alt="" class="size-7 shrink-0 rounded-full object-cover" />
								{:else}
									<span
										class="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
									>
										{displayName(follow).slice(0, 1).toUpperCase()}
									</span>
								{/if}
								<span class="min-w-0 truncate text-sm">{displayName(follow)}</span>
								<span class="ml-auto shrink-0 font-mono text-xs text-zinc-500">
									{browse.shortNpub(follow.hex)}
								</span>
							</button>
						{/each}
					</div>
				{/if}
			{:else if browse.mode === 'shelf'}
				{#if browse.shelf.length === 0 && Object.keys(browse.looseAnnotations).length === 0}
					<div class="flex flex-col items-center gap-3 py-16 text-center">
						<BookOpen class="size-10 text-zinc-300 dark:text-zinc-700" />
						<p class="max-w-sm text-sm text-zinc-500">
							Nothing shared (or nothing reached your relays). Their library is private by
							default — only books and annotations they explicitly share show up here.
						</p>
					</div>
				{:else}
					<div class="flex flex-col gap-3">
						{#each browse.shelf as fb (fb.sha256)}
							<div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
								<div class="flex gap-3">
									{#if fb.coverUrl}
										<img src={fb.coverUrl} alt="" class="h-24 w-16 shrink-0 rounded object-cover shadow-sm" />
									{:else}
										<div
											class="flex h-24 w-16 shrink-0 items-center justify-center rounded bg-zinc-100 dark:bg-zinc-800"
										>
											<BookOpen class="size-5 text-zinc-300 dark:text-zinc-600" />
										</div>
									{/if}
									<div class="min-w-0 flex-1">
										<div class="text-sm font-medium">{fb.book.title}</div>
										<div class="text-xs text-zinc-500">{fb.book.creator}</div>
										<div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
											{#if fb.inLibrary}
												<span class="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-600 dark:text-emerald-400">
													In your library
												</span>
											{/if}
											{#if fb.annotations.length}
												<button class="underline-offset-2 hover:underline" onclick={() => (expandedSha = expandedSha === fb.sha256 ? null : fb.sha256)}>
													{fb.annotations.length} public annotation{fb.annotations.length > 1 ? 's' : ''}
												</button>
											{/if}
										</div>
										{#if !fb.inLibrary && fb.book.blossom?.servers.length}
											<button
												class="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50"
												disabled={browse.isDownloading(fb.sha256)}
												onclick={() => void browse.downloadBook(fb)}
											>
												{#if browse.isDownloading(fb.sha256)}
													<Loader2 class="size-3.5 animate-spin" />
												{:else}
													<CloudDownload class="size-3.5" />
												{/if}
												Add to my library
											</button>
										{/if}
									</div>
								</div>
								{#if expandedSha === fb.sha256}
									<div class="mt-3 flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
										{#each fb.annotations as anno (anno.id)}
											<div class="flex items-start gap-2">
												{#if anno.color}
													<span
														class="mt-1 size-3 shrink-0 rounded-full"
														style="background: {HIGHLIGHT_COLORS[anno.color]}"
													></span>
												{:else}
													<StickyNote class="mt-0.5 size-3.5 shrink-0 text-red-500" />
												{/if}
												<div class="min-w-0">
													<p class="text-sm text-zinc-700 dark:text-zinc-300">“{anno.quote}”</p>
													{#if anno.note}
														<p class="mt-0.5 text-xs text-zinc-500">{anno.note}</p>
													{/if}
												</div>
											</div>
										{/each}
									</div>
								{/if}
							</div>
						{/each}

						{#each Object.entries(browse.looseAnnotations) as [sha, annos] (sha)}
							<div class="rounded-lg border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
								<div class="mb-2 flex items-center gap-1.5 text-xs text-zinc-500">
									<Globe class="size-3.5" />
									Public annotations on an unshared book ({sha.slice(0, 8)}…)
								</div>
								<div class="flex flex-col gap-2">
									{#each annos as anno (anno.id)}
										<div class="flex items-start gap-2">
											{#if anno.color}
												<span
													class="mt-1 size-3 shrink-0 rounded-full"
													style="background: {HIGHLIGHT_COLORS[anno.color]}"
												></span>
											{:else}
												<StickyNote class="mt-0.5 size-3.5 shrink-0 text-red-500" />
											{/if}
											<div class="min-w-0">
												<p class="text-sm text-zinc-700 dark:text-zinc-300">“{anno.quote}”</p>
												{#if anno.note}
													<p class="mt-0.5 text-xs text-zinc-500">{anno.note}</p>
												{/if}
											</div>
										</div>
									{/each}
								</div>
							</div>
						{/each}
					</div>
				{/if}
			{:else if browse.mode === 'readers'}
				{#if browse.readers.length === 0}
					<p class="py-16 text-center text-sm text-zinc-500">
						No one else has shared annotations on this book (on your relays).
					</p>
				{:else}
					<div class="flex flex-col gap-1">
						{#each browse.readers as reader (reader.profile.hex)}
							<button
								class="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
								onclick={() => void browse.browseUser(reader.profile.hex)}
							>
								{#if reader.profile.picture}
									<img src={reader.profile.picture} alt="" class="size-7 shrink-0 rounded-full object-cover" />
								{:else}
									<span
										class="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
									>
										{displayName(reader.profile).slice(0, 1).toUpperCase()}
									</span>
								{/if}
								<span class="min-w-0 truncate text-sm">{displayName(reader.profile)}</span>
								<span class="ml-auto shrink-0 text-xs text-zinc-500">
									{reader.count} annotation{reader.count > 1 ? 's' : ''}
								</span>
							</button>
						{/each}
					</div>
				{/if}
			{/if}
		</div>
	</div>
</div>
