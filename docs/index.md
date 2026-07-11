# VibeReader

A local-first EPUB reader built as a **nostr-ecosystem app**: your books,
highlights, notes, and reading progress live in your browser under your nostr
identity — and nothing leaves it unless you say so.

- **Read** — EPUBs rendered client-side with pagination, table of contents,
  and light/dark/sepia reading themes.
- **Annotate** — one unified primitive: select text, add a highlight color
  and/or a note. Everything is editable.
- **Ask** — a reading-companion AI on any selection, running against an LLM
  endpoint *you* configure (LM Studio on localhost is a first-class citizen).
- **Own it** — identity is a nostr keypair; storage is per-npub IndexedDB;
  backup/sync/sharing happen only on explicit action, as encrypted nostr
  events and Blossom blobs.

## Where to go

- [Philosophy](PHILOSOPHY.md) — the six binding principles.
- [Architecture](architecture.md) — how the client is put together.
- [Nostr event model](nostr-event-model.md) — the sync/sharing contract
  (kinds 30101–30104, Blossom, NIP-84 compatibility).
- [Development](development.md) — clone, run, verify.

## Status

Proof-of-concept rebuild in progress. The scaffold (identity, per-npub
storage, docs) is live; the reader core, AI chat, and explicit sync are
landing in that order. The previous prototype
([VibeReaderTwo](https://github.com/PlebeiusGaragicus/VibeReaderTwo)) is
deprecated — this rebuild keeps its reader UX and event-model ideas and
drops its backend/Electron architecture.
