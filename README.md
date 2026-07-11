# VibeReader

An EPUB reader built as a **nostr-ecosystem app** — a clean rebuild, from
scratch, of the earlier proofs of concept.

What that means here:

- **Web-first, no app stores** — a static, client-side-only web app. No
  backend, no Electron.
- **Relays are the file system** — reading progress, highlights, notes, and
  library metadata sync as (encrypted) replaceable nostr events; shareable
  highlights use NIP-84. EPUB files themselves live on Blossom servers,
  addressed by sha256.
- **The browser is the primary store** — IndexedDB per npub holds your
  library for offline reading; relays and Blossom are the backup/sync layer.
- **Identity is a nostr keypair** — no accounts, no KYC.
- **Payments are bitcoin** — lightning/ecash only, non-custodial.
- **AI is integrated, inference is sovereign** — bring-your-own LLM endpoint
  is always a first-class path.

Status: fresh start — nothing here yet.
