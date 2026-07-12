# Nostr event model

This is the sync contract: how VibeReader state maps onto nostr events and
Blossom blobs. It is written before the sync implementation (Phase D) so the
local data model can mirror it 1:1 from day one. Changes here are protocol
changes — think before editing.

## Design rules

1. **Book identity is the EPUB file's sha256** (lowercase hex). It is
   simultaneously the IndexedDB key, the nostr `d` tag, the Blossom blob
   address, and the cross-user "same book" matching key. Deterministic
   identity means events from two devices merge without ID reconciliation.
   A different file (another edition, a fixed typo) is a different book; the
   NIP-73 ISBN tag is the cross-edition escape hatch.
2. **Private by default**: event `content` is NIP-44-encrypted to the
   author's own key (the NIP-60/NIP-51 self-encryption pattern). Private
   events carry no cleartext tags beyond `d` — titles, quotes, and even which
   book an event belongs to stay inside the ciphertext.
3. **Addressable replacement is the edit primitive**: all custom kinds live
   in the 30000–39999 addressable range, so republishing with the same `d`
   supersedes the old event. No NIP-09 delete choreography for updates.
4. **Sharing = republishing the same event in plaintext** (see kind 30104
   below) — shared state stays editable and addressable. NIP-84 export is a
   compatibility bonus, not the mechanism.
5. **Explicit only**: nothing below is published without a user action.

## Kind registry

The original PoC drafted kinds 30001–30005; those collide hard with NIP-51
(30002 relay sets, 30003 bookmark sets, 30004/30005 curation sets), so the
design moved to the unassigned 3010x block (verified against the NIPs
registry: 30079–30165 has no assignments).

| Kind | Entity | `d` tag | Encryption |
|---|---|---|---|
| 30101 | Book metadata | `{epub-sha256}` | NIP-44 to self, **or plaintext when shared** |
| 30102 | Reading progress | `{epub-sha256}` | NIP-44 to self |
| 30103 | App settings | `vibereader` | NIP-44 to self |
| 30104 | Annotation (unified) | `anno-{id}` | NIP-44 to self, **or plaintext when shared** |
| 30105–30106 | reserved (chat sync — undecided; transcripts are device-local for now) | | |

Standard kinds used as-is:

| Kind | Use |
|---|---|
| 9802 | NIP-84 highlight — optional export at share time for Highlighter/Amethyst compatibility |
| 10063 | Blossom user server list (BUD-03) |
| 24242 | Blossom authorization events (BUD-11) |

## Event schemas

Timestamps are Unix **ms** inside content (matching the local model);
`created_at` is standard nostr seconds. All content shapes are exactly the
IndexedDB record minus redundant keys.

### 30101 — Book metadata

```jsonc
{
  "kind": 30101,
  "tags": [["d", "<epub-sha256>"]],
  // content, NIP-44 encrypted to self:
  "content": {
    "title": "…", "creator": "…",
    "publisher": "…", "language": "en", "isbn": "…", "description": "…",
    "fileSize": 1234567,
    "blossom": { "servers": ["https://…"], "coverSha256": "…" }, // where the bytes live, if backed up
    "addedAt": 1752264000000, "updatedAt": 1752264000000
  }
}
```

**Shared (public shelf):** same mechanism as shared annotations (design
rule 4) — the *same* event, same `d`, republished with plaintext content
plus NIP-73 ISBN tags when known:

```jsonc
{
  "kind": 30101,
  "tags": [
    ["d", "<epub-sha256>"],
    ["i", "isbn:9780765382030"],       // NIP-73, when known
    ["k", "isbn"]
  ],
  "content": "{ …same JSON, unencrypted… }"
}
```

Semantics: this is the user's opt-in **public shelf**. Title, creator,
publisher, language, ISBN, description, and fileSize become public — and so
does the `blossom` pointer if present, which makes the book *file* fetchable
by anyone (public-by-hash; the deliberate "borrow from a friend's shelf"
path — the share confirm must say so). `lastOpenedAt` is stripped as always;
reading progress (30102) never gets a plaintext variant. Unshare =
republish encrypted, drop the tags. Browse queries this enables:

- Someone's public shelf: `{"kinds":[30101,30104],"authors":["<pk>"]}`,
  keeping only plaintext-parseable events.
- Readers of a book: `{"kinds":[30104],"#x":["<sha256>"]}` (already below).

### 30102 — Reading progress

```jsonc
{
  "kind": 30102,
  "tags": [["d", "<epub-sha256>"]],
  "content": { // encrypted
    "cfi": "epubcfi(/6/12!/4/2/8:12)",
    "percentage": 0.42,
    "sectionHref": "chapter4.xhtml",
    "updatedAt": 1752264000000
  }
}
```

Merge rule: last-write-wins by content `updatedAt` (not relay `created_at`).

### 30103 — App settings

```jsonc
{
  "kind": 30103,
  "tags": [["d", "vibereader"]],
  "content": { // encrypted
    "reading": { "fontSize": 18, "fontFamily": "serif", "lineHeight": 1.6, "theme": "sepia" },
    "updatedAt": 1752264000000
  }
}
```

AI endpoint config (keys!) is deliberately **excluded** — it never leaves the
device.

### 30104 — Annotation (the unified primitive)

One event per selection. Highlight-only (`color`, no `note`), note-only
(`note`, no `color`), or both. The `d` value is a stable random ID — never
the CFI, which can change with rendering.

**Private (default):**

```jsonc
{
  "kind": 30104,
  "tags": [["d", "anno-V1StGXR8_Z5jdHi6B-myT"]],
  "content": { // encrypted
    "book": "<epub-sha256>",
    "cfiRange": "epubcfi(/6/12!/4/2,/8:5,/10:12)",
    "quote": "the highlighted text",
    "color": "yellow",          // optional
    "note": "user's thoughts",  // optional
    "createdAt": 1752264000000, "updatedAt": 1752264000000
  }
}
```

**Shared (user flips an annotation public):** the *same* event — same kind,
same `d` — republished with plaintext content plus cleartext query tags:

```jsonc
{
  "kind": 30104,
  "tags": [
    ["d", "anno-V1StGXR8_Z5jdHi6B-myT"],
    ["x", "<epub-sha256>"],            // cross-user book matching key
    ["i", "isbn:9780765382030"],       // NIP-73, when known
    ["k", "isbn"]
  ],
  "content": "{ …same JSON, unencrypted… }"
}
```

Because it stays addressable, a shared annotation remains editable and can be
made private again (republish encrypted, drop the tags). "All public
annotations on this book, from anyone" is one query:
`{"kinds":[30104],"#x":["<sha256>"]}`.

**Optional NIP-84 export:** at share time the user may also emit a standard
kind 9802 (immutable) so the highlight renders in Highlighter, Amethyst,
etc.: `content` = quote, `comment` tag = note, `x`/`i` tags as above, plus a
`["a", "30104:<pubkey>:anno-…"]` back-reference to the living annotation.
The 9802 is a derived snapshot — the 30104 stays canonical.

### Blossom (books & covers)

- EPUB bytes and cover images upload as-is; their sha256 **is** their address
  (BUD-01/02), which by design equals the book ID.
- Auth via kind 24242 events signed by the user's key (BUD-11), scoped with
  `t`/`x`/`server` tags and an expiration.
- The user's server list is a kind 10063 event (BUD-03); uploads go to the
  first server, mirror to the rest (`PUT /mirror`).
- Servers cap sizes by policy (~100 MB class) — check with `HEAD /upload`
  before pushing.
- Restore path: a 30101 whose bytes are missing locally → fetch
  `https://<server>/<sha256>.epub`, re-verify the hash, store.

## Resolved design decisions (2026-07, Phase D alignment)

- **Pull = naive REQ**: one `{"kinds":[30101,30102,30103,30104],"authors":[me]}`
  fetch per sync. Addressable events mean the relay already holds only the
  latest per `d`, so this is current state in one round trip. Negentropy
  (NIP-77) stays a future optimization (cyphertap carries a client
  implementation, currently unexported).
- **Merge = last-write-wins** by `updatedAt` inside content (not relay
  `created_at`), per record. Multiple relays may return stale versions of the
  same addressable event — dedup by `(kind, d)` keeping newest `created_at`
  before merging.
- **Deletes propagate as tombstones**: deleting republishes the same
  addressable event with content `{deleted: true, updatedAt}` (encrypted as
  usual). LWW makes every device converge; the local DB keeps a tombstone row
  so later pushes can't resurrect. A NIP-09 kind-5 (`["a","<kind>:<pk>:<d>"]`,
  `["k","<kind>"]`) is also emitted for relays that honor it — bonus cleanup,
  not load-bearing.
- **Blobs upload raw** (no client-side encryption): the EPUB's sha256 stays
  simultaneously identity and Blossom address, and identical files dedup
  across users. **Consequence the UI must own**: anything backed up to a
  public Blossom server is fetchable by anyone who can compute the book's
  hash — fine for freely-licensed content, effectively public redistribution
  for purchased ebooks. The first backup shows an explicit warning; file
  backup is per-book and opt-in, never automatic.
- **Sync UX**: one global "Sync" action (library header) pushes+pulls all
  state events; per-book "Back up file" handles the Blossom blob separately.
  An unsynced-changes dot on the Sync button, a summary toast after. Relay
  and Blossom-server lists are user-editable in Settings (Blossom list also
  published as kind 10063).
- **Chat sync**: transcripts stay device-local; 30105/30106 remain reserved.
