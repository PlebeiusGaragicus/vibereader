# Architecture

VibeReader is a single-page SvelteKit app (static adapter, `ssr = false`,
prerendered shell) that runs entirely in the browser. There is no backend.

```
┌──────────────────────── browser ────────────────────────┐
│  cyphertap widget ── nostr identity (npub)               │
│        │                                                 │
│  session store ── opens vibereader::<npub> (IndexedDB)   │
│        │                                                 │
│  runes stores ── library · reader · annotations · chat   │
│        │                      │                          │
│  epub service (epub.js)   db layer (idb)                 │
│        │                                                 │
│  ai client ──→ BYO OpenAI-compatible endpoint (CORS)     │
│  nostr sync (Phase D, explicit) ──→ relays + Blossom     │
└──────────────────────────────────────────────────────────┘
```

## Layers

- **`src/lib/db/`** — one IndexedDB per npub (`vibereader::<npub>`); identity
  isolation is structural (no npub fields on entities). Stores: `books`
  (metadata), `bookFiles` + `covers` (Blobs, stored raw — JSON cloning
  destroys Blobs), `locations` (epub.js pagination cache), `progress`,
  `annotations` (unified highlight/note records mirroring kind 30104),
  `chats` (device-local), `kv`. Deleting a book cascades across all stores in
  one transaction.
- **`src/lib/epub/`** — the only code that touches epub.js. The live
  `Book`/`Rendition` objects are plain module state (never `$state` — they
  can't survive proxying). epub.js is effectively unmaintained; isolating it
  here keeps it swappable.
- **`src/lib/stores/`** — Svelte 5 runes singletons (module `$state` +
  getters, `init`/`reset` lifecycle). `session` bridges cyphertap login to
  the DB; `library`, `reader`, `annotations`, `selection`, `chat`, `ui` own
  their slices; `settings` lives in localStorage (device preference, includes
  the AI endpoint config which never syncs).
- **`src/lib/ai/`** — plain `fetch` to an OpenAI-compatible
  `/chat/completions`, streaming with single-shot fallback. Contains the
  single `// PAYMENTS:` seam. Payments are deferred deliberately — metered
  ecash-per-request when they arrive, never custody, never fiat. Do not build
  ahead of the seam.
- **`src/lib/nostr/`** — (Phase D) event codecs for the
  [event model](nostr-event-model.md), explicit sync, Blossom client.

## Key mechanics

- **Annotations** render through epub.js's native annotation layer
  (`rendition.annotations`), applied only after the first `rendered` event.
  Sidebar ordering uses `EpubCFI.compare`, never lexical CFI sorting.
- **Selection → context menu** uses `rendition.on('selected')` plus the
  emitting iframe's bounding rect to position the menu — no global mouse
  tracking.
- **Locations** (`book.locations`) generate in the background on first open
  and are cached in IndexedDB; percentage display degrades gracefully until
  ready.
- **Reading theme ≠ app theme**: light/dark/sepia inside the book iframe via
  `rendition.themes`; app chrome follows mode-watcher light/dark.
