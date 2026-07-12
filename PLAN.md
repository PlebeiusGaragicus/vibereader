# PLAN: Ghost books + social reading (proposal 5, approved 2026-07-12)

Working document for the approved implementation of proposals.md #5 — all
three phases (A: ghost books, B: public shelf + browse, C: multi-perspective
reading). Delete this file when the work lands and CLAUDE.md's roadmap is
updated.

Origin: VibeReaderTwo `docs/technical/specification.md` §3.5 ("Social &
Collaborative Features") — discovery panel, browse-someone's-library,
read-only annotation views. All unimplemented checkboxes there. The term
"ghost book" is new; the concept (annotations readable without the book
file) falls out of our sync design.

## Verified groundwork (read before changing — all confirmed 2026-07-12)

- `compareCfi` (`src/lib/epub/service.ts:212`) uses a bare `new EpubCFI()`
  — spine-sorting annotations needs **no book file**.
- Sync already pulls 30101/30104 regardless of file presence; ghost books
  already exist in the DB today (`library.missingFiles`).
- `parseRemote` (`src/lib/nostr/events.ts:157`) detects plaintext vs
  ciphertext **generically** (`content.startsWith('{')`) — a plaintext
  30101 already parses on pull; only the `shared` flag isn't plumbed for
  books, and `bookDraft` always encrypts.
- `annotationDraft` is the model for the shared/private encode branch
  (plaintext + `['x', sha256]` tag when `anno.shared`).
- cyphertap API (`cyphertap/src/lib/api/cyphertap-api.svelte.ts`):
  - `fetchEvents(filter)` — arbitrary filters incl. `authors`, `#x`.
  - `getFollows()` — kind-3 contact list as hex pubkeys.
  - `npubToHex` / `hexToNpub` exported from the package root.
  - No profile API — fetch kind 0 via `fetchEvents({kinds:[0], authors})`,
    parse `content` JSON (`name` / `display_name` / `picture`).
- `applyAnnotation` (`service.ts:220`) shows the rendition mark pattern;
  foreign marks get their own type/class (underline, distinct style).
- Reader annotations store (`stores/annotations.svelte.ts`): module state
  `items` + `applyToRendition()` gate after first `rendered` event (epub.js
  crashes if earlier — existing gotcha).

## Phase A — Ghost books (pure client, no protocol change)

A **ghost book** = 30101 metadata + 30104 annotations local, file bytes not.
Today `library.open()` toasts "restore first" and dead-ends. Instead it
becomes a first-class read-only view.

### Changes

1. `src/lib/stores/ui.svelte.ts`: `view` union gains `'ghost'`; new
   `ghostSha: string | null` (reset() clears it).
2. `src/lib/stores/library.svelte.ts` `open()`: when
   `missingFiles[sha256]`, set `ui.ghostSha = sha256; ui.view = 'ghost'`
   instead of the toast.
3. New `src/lib/components/library/GhostView.svelte`:
   - Header: back button (→ library), cover thumb if cached, title,
     creator, "file not on this device" notice.
   - Restore CTA: `sync.restoreBook(sha)` → on success (file now present)
     offer "Open book" (routes into the reader) — or auto-open.
   - Body: `db.annotations.getByBook(sha)` sorted with `epub.compareCfi`,
     rendered like AnnotationSidebar cards (color dot / note icon, quote,
     note) but **read-only**: no goTo (needs rendition), no edit, no share
     toggle. Keep share state visible (Globe icon) as info.
   - Empty state: "No annotations for this book yet."
4. `src/routes/+page.svelte`: render `GhostView` when `ui.view === 'ghost'`
   (library header hidden like reader view, or kept — keep it hidden for
   consistency with reader).
   - Session/logout paths already `ui.reset()` → safe.

### Verify (playwright, bob test account)

Fresh profile → login → Sync → tap a metadata-only book card → ghost view
shows spine-sorted annotations (need a book with annotations: create one
via alice/original profile first, share nothing — private annos sync to
self). Restore from ghost view → reader opens, same annotations live.

## Phase B — Public shelf + browse someone's library

### B1. Protocol addition (docs first — this is a contract change)

`docs/nostr-event-model.md`:
- Kind table: 30101 encryption column → "NIP-44 to self, **or plaintext
  when shared**" (same wording as 30104).
- New subsection under 30101: **Shared (public shelf)** — the same event,
  same `d`, republished with plaintext content plus `i`/`k` ISBN tags
  (NIP-73) when known. Semantics:
  - Shares: title/creator/publisher/language/isbn/description/fileSize,
    `blossom` pointer (⇒ the file itself becomes fetchable by anyone —
    this is the "borrow from a friend's shelf" path, deliberate).
  - Never shared even in plaintext: `lastOpenedAt` (already stripped),
    reading progress (30102 stays private — never gets a shared variant).
  - Unshare = republish encrypted (mirrors annotations).
- Note the browse queries this enables:
  - Someone's shelf: `{kinds:[30101,30104], authors:[pk]}`, plaintext only.
  - Readers of a book: `{kinds:[30104], "#x":[sha256]}`.

### B2. Data model + codecs

1. `src/lib/db/types.ts`: `Book` gains `shared?: boolean` (mirrors
   `Annotation.shared`).
2. `src/lib/nostr/events.ts`:
   - `bookDraft(book)`: when `book.shared`, plaintext content (strip
     `lastOpenedAt` AND `shared` itself from payload? No — keep `shared`
     out of the payload the same way annotations do: annotation payload
     includes `shared` today via `...rest`… actually check: annotationDraft
     spreads rest which includes `shared: true`. Harmless; keep symmetric.)
     plus `isbnTags(book)` tags. Else `sealed` as today.
   - `ParsedRemote` book variant gains `shared: boolean`; `parseRemote`
     returns `shared` for KIND_BOOK (the plaintext branch already sets it).
   - New `parseForeign(event)` — plaintext-only parse for OTHER people's
     events (never attempts decrypt): returns
     `{kind: 30101, sha256, book}` or `{kind: 30104, id, annotation}` or
     null. Reuses the same payload→record mapping; skips tombstones
     (`deleted: true` → null).
3. `src/lib/nostr/sync.ts`: book merge preserves `shared` (comes through
   `parsed.book` spread — verify the field survives; push side needs
   `isbnTags` on shared book drafts, same as the annotation branch at
   line ~137).

### B3. Share toggle UI

`BookInfoDialog.svelte`, new "Sharing" section above Blossom backup:
- Status line: Private (default) / "On your public shelf" (emerald).
- Toggle with confirm (mirrors annotation share confirm): explains that
  title/author/description go plaintext to relays, and — if a Blossom
  backup is recorded — that the file pointer becomes public too.
- Implementation: `book.shared = true; book.updatedAt = Date.now();
  db.books.save; checkDirty` — publishes on next explicit Sync (consistent
  with everything else; the dialog copy says so).

### B4. Browse view

1. `src/lib/stores/browse.svelte.ts` (runes singleton, session-memory only
   — **nothing foreign is written to the per-npub DB**):
   - State: `target?: {hex, profile?}`, `shelf: ForeignBook[]`,
     `annotationsBySha: Record<sha, ForeignAnnotation[]>`, `follows:
     {hex, profile?}[]`, `readers: {hex, profile?, count}[]`, `loading`.
   - `browseUser(npubOrHex)`: `npubToHex` if needed →
     `fetchEvents({kinds:[30101,30104], authors:[hex]})` →
     `dedupeByAddress` → `parseForeign` → shelf + grouped annotations;
     profile via kind-0 fetch.
   - `loadFollows()`: `getFollows()` → batch kind-0 fetch → named list.
   - `findReaders(sha256)`: `fetchEvents({kinds:[KIND_ANNOTATION],
     '#x':[sha256]})` → group by pubkey (exclude self) → counts + profiles.
   - `reset()` on logout.
2. `src/lib/components/browse/BrowseView.svelte` (+ small subcomponents):
   - Entry: `ui.view = 'browse'`; Users/Compass icon button in library
     header.
   - Input row: npub paste + Go; below, follows as tappable chips/cards
     (avatar, name) — loaded lazily on first open.
   - Shelf: card per shared book — cover (fetch
     `blossom.coverSha256` from their recorded servers via `downloadBlob`,
     objectURL, session cache), title, creator, annotation count, "In your
     library" badge on sha256 match.
   - Book detail (expand or dialog): their shared annotations for that
     sha (spine-sorted, read-only, with notes), plus:
     - "Download book" when their 30101 records `blossom.servers`:
       `downloadBlob(servers, sha, '.epub')` (hash-verified) → wrap in
       `File` → `importEpubFile` (dedup by sha built in) → lands in MY
       library normally. Show the same public-by-hash framing; content
       comes from THEIR backup.
   - Readers mode: opened from BookInfoDialog "Find readers" button —
     lists pubkeys with shared annotations on that book; tap → browse
     that user's shelf.
3. Mobile: single-column layout; BrowseView is a full view (not a dialog)
   so it works on phones without new drawer machinery.

### Verify

Two-profile flow (alice = sharer, bob = browser; whitelisted test relay):
1. As alice: import book, back up to Blossom, share book (dialog toggle),
   share 2 annotations, Sync.
2. As bob (fresh profile): Browse → paste alice's npub → shelf shows the
   book w/ cover + 2 annotations; "Download book" imports it (sha match
   badge flips); readers-of-book from the info dialog lists alice.
3. Unshare as alice + Sync → bob re-browse: book gone from shelf.
   (Encrypted republish replaces the plaintext addressable event — same
   mechanism as annotation unshare, already proven in Phase D.)

## Phase C — Multi-perspective reading (foreign highlights in MY reader)

Explicitly fetched, never automatic (philosophy: relay reads behind user
action). Read-only overlay, visually distinct from own annotations.

### Changes

1. `src/lib/stores/annotations.svelte.ts` (or a sibling
   `foreignAnnotations.svelte.ts` — decide by size; sibling keeps the own
   store untouched): state `readers: {hex, profile?, annotations:
   ForeignAnnotation[], shown: boolean}[]`; `fetchForBook(sha)` (reuses
   `browse.findReaders` data path), `toggle(hex)`.
2. `src/lib/epub/service.ts`: `applyForeignAnnotation(anno, readerHex)` —
   `rendition.annotations.add('underline', cfiRange, {id, foreign: true},
   undefined, 'vr-foreign-underline', {stroke: <fixed accent>,
   'stroke-opacity': '0.7', 'stroke-dasharray': '2 1'?})` + matching
   `removeForeignAnnotation` (remove needs same type+cfi — existing
   update() shows the remove-under-old-shape pattern). All epub.js contact
   stays in this file (seam rule).
3. `AnnotationSidebar.svelte`: bottom section "Other readers" —
   "Load readers' highlights" button (first use), then per-person rows
   (name, count, eye toggle). Toggling applies/removes their marks
   (gated on the same `applied`/first-`rendered` rule — reuse the gate).
   Foreign items listed under the person, read-only cards; tap →
   `rendition.display(cfiRange)` jump is safe (no edit affordances).
4. Reader close (`reader.close()` / store resets): clear foreign state.

### Verify

Alice shares annotations on a book; bob has the same book (imported via
Phase B download). Bob opens the book → sidebar → Load readers →
alice appears with count → toggle on → underlines render at the right
text (same sha256 ⇒ same CFIs); toggle off removes them; own annotations
unaffected; reload → foreign marks gone (not persisted) until fetched
again.

## Cross-cutting

- **Privacy/philosophy checklist**: browse fetches are behind explicit
  actions; nothing foreign persisted; nothing published while browsing;
  share is opt-in per book with a confirm that names exactly what becomes
  public; progress (30102) never has a plaintext variant.
- **Relay reach limitation (accepted v1)**: browse queries OUR configured
  relays only. relay.primal.net default gives reach; NIP-65 lookup of the
  target's write relays is a recorded future upgrade (cyphertap reads kind
  10002 internally already).
- **Docs**: update `docs/nostr-event-model.md` (B1) and CLAUDE.md roadmap
  (add Phase E line) when landing; move proposals.md #5 status to
  ACCEPTED → implemented.
- **Order**: A → B1..B4 → C, `pnpm check` + targeted playwright run per
  phase (scripts pattern: scratchpad login-as-bob harness from this
  session; alice/bob keys in `../my-projects/.test-accounts.json`).
- **Out of scope (recorded, not built)**: popular-highlights aggregation,
  NIP-65 outbox for browse, following/unfollowing from within the app,
  9802-based discovery (30104 `x` tags are the canonical query; 9802 is
  export-only compat).
