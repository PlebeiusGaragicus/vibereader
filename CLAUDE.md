# VibeReader — working notes

Local-first EPUB reader: nostr login (cyphertap) + books/annotations/progress
in per-npub IndexedDB + epub.js rendering + a reading-companion AI against a
BYO CORS-enabled LLM endpoint. Static build, GitHub Pages, zero backend.
Rebuilt from scratch; `../VibeReaderTwo` is read-only reference (its
React/FastAPI/Electron architecture is deliberately gone — mine it only for
reader UX details and the docs that seeded our event model).

## Design philosophy (binding)

`docs/PHILOSOPHY.md` defines what "nostr-ecosystem app" means and wins over
convenience. Short version: static client-side web app, no server-side ever
(anything we integrate must be browser-CORS reachable); IndexedDB is primary
storage; relays/Blossom are **explicit, user-triggered** sync/backup/sharing —
never background; identity is a nostr keypair; payments bitcoin-only
(deferred — the `// PAYMENTS:` seam is the whole implementation); BYO
inference is always first-class. `docs/nostr-event-model.md` is the sync
contract (kinds 30101–30104, sha256-as-book-identity) — changes there are
protocol changes.

## Dev loop

```sh
git clone --recurse-submodules …   # plain clone breaks workspace:* resolution
pnpm install
pnpm dev                            # .env (gitignored) pre-fills AI settings
pnpm check                          # svelte-check, CI-enforced
BASE_PATH=/vibereader pnpm build && pnpm preview   # what Pages serves
pip install -r docs-requirements.txt && mkdocs serve   # docs site
```

Verify UI changes with playwright screenshots (available via
`cyphertap/node_modules/playwright`), not curl. Test accounts: the
whitelisted alice/bob/carol keypairs in `../my-projects/.test-accounts.json`.
Keep test EPUBs out of git.

## Architecture map

- `src/lib/db/` — one IndexedDB per npub (`vibereader::<npub>`); stores:
  books (metadata), bookFiles + covers (**Blobs, raw put — the JSON `clone()`
  would destroy them**), locations (epub.js pagination cache), progress,
  annotations (unified highlight/note, mirrors kind 30104 1:1), chats
  (device-local), kv. Book identity = EPUB sha256 everywhere. Cascade book
  delete in one tx. No npub fields on entities — isolation is structural.
- `src/lib/epub/` — the ONLY code touching epub.js; live Book/Rendition are
  plain module state (never `$state` — proxies break them). epub.js is
  unmaintained; keep it swappable behind this seam.
- `src/lib/stores/` — runes singletons (module `$state` + getters +
  init/reset). `session` bridges cyphertap login → DB open (+
  `storage.persist()`); `settings` is localStorage with VITE_ env-default
  layering (AI endpoint config never syncs, never leaves the device).
- `src/lib/ai/` — (Phase C) plain fetch, OpenAI-compatible, SSE +
  single-shot fallback. **Payments seam**: the no-op `// PAYMENTS:` hook —
  deferred deliberately, do not build ahead of it.
- `src/lib/nostr/` — (Phase D) codecs/sync/blossom per
  `docs/nostr-event-model.md`. All relay use is behind explicit UI actions.

## Gotchas

- epub.js MUST be fed an ArrayBuffer, never a URL (it 404s fetching internal
  paths). Blob from IndexedDB → arrayBuffer → `ePub(buffer)`.
- Add annotations to the rendition only AFTER the first `rendered` event —
  earlier crashes epub.js (`stepsToXpath`).
- Never sort CFIs lexically; use `new EpubCFI().compare(a, b)`.
- ONE canonical camelCase data shape everywhere (VibeReaderTwo's
  camelCase/snake_case split caused a bug class we refuse to reinherit).
- `epubjs` is CJS — it lives in `optimizeDeps.include`; extend that list if
  dev-mode mid-mount reloads reappear.
- `vite.config.ts` `server.fs.allow: ['cyphertap']` is required — dynamic
  imports inside the submodule resolve to real paths outside node_modules.
- cyphertap submodule: changes flow upstream first (its repo), then bump the
  pointer here; after any dep-changing bump run `pnpm install` and commit the
  lockfile (CI `--frozen-lockfile` catches it). See cyphertap
  `docs/CONSUMING.md` Pattern B.
- Reading theme (rendition.themes, light/dark/sepia inside the book iframe)
  is independent of app chrome theme (mode-watcher light/dark). Don't couple
  them.
- The LLM endpoint must allow browser CORS. Known-good: Anthropic,
  OpenRouter, local llama.cpp/LM Studio/Ollama w/ CORS, and the homelab
  gateway `https://api.abvstudio.net/v1`.
- Blossom auth: BUD-11 says base64url-no-padding, but deployed servers
  (nostr.download, nak) require STANDARD base64 — `blossom.ts` follows the
  ecosystem. Most public Blossom servers are useless for us: primal/v0l
  block browser CORS on /upload, band/nostrcheck/f7z/24242.io reject
  `application/epub+zip`. nostr.download is the only working public default
  (verified 2026-07); self-hosting is the recommended path.
- The BUD-06 preflight is advisory — only an explicit 413 blocks an upload
  (nostr.download 400s the HEAD but accepts the PUT).
- cyphertap's `publishEvent` can surface an async `NDKPublishError`
  ("0 published, 1 required") as an unhandled rejection when a pool relay
  rejects — benign: the event lands in cyphertap's unpublished-events cache
  and retries.
- Multi-tab is out of scope for v1: two tabs on one DB can clobber
  progress/annotations last-write-wins.

## Roadmap (from the approved plan)

- **A (done)** — scaffold, per-npub DB/session skeleton, docs site (MkDocs →
  `/docs/` on Pages), CLAUDE.md, philosophy + event-model contract.
- **B (done)** — reader core: import (sha256 dedup), epub service, reader UI (TOC,
  themes, progress resume), unified annotations (context menu + spine-sorted
  sidebar).
- **C (done)** — AI chat on selection (BYO endpoint, streaming + fallback) +
  `// PAYMENTS:` seam.
- **D (done)** — explicit sync: 30101–30104 codecs (NIP-44 to self), global
  "Sync" (naive REQ pull → LWW merge w/ tombstones → push), per-book Blossom
  backup/restore (raw, public-by-hash, warned), annotation sharing
  (plaintext 30104 + optional 9802 export). Contract:
  `docs/nostr-event-model.md`. Verified: two-profile round trip incl.
  tombstone propagation and Blossom restore.
- **Next**: payments on the `// PAYMENTS:` seam (ecash-per-request), nsite
  publishing, mobile polish.
