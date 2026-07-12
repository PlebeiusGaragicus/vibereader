# VibeReader is a nostr-ecosystem app

This document defines what that phrase means. It is binding: when a feature
idea, dependency, or shortcut conflicts with a principle here, the principle
wins. Change this document first if a principle needs to change.

## The six principles

### 1. Web-first. No app stores.

The app is a static, client-side-only web build. Anyone can serve it (GitHub
Pages today; publishing the site itself to nostr as an
[nsite](https://github.com/hzrd149/nsite-gateway) is the ecosystem-native end
state). There is no server-side component and there never will be — no SSR, no
backend API, no proxy we operate, no Electron wrapper. Consequence: **every
external service the app talks to must be reachable directly from the
browser.** CORS support is an acceptance criterion for any integration, not a
nice-to-have.

### 2. Relays are the file system.

Reading state that should outlive one browser belongs on nostr relays as
addressable replaceable events — one primitive that gives us device sync,
backup, and sharing at once. Rules of the medium:

- **Explicit, never automatic**: relays are used only when the user asks —
  "Back up", "Sync", "Share". There is no background replication. Local-first
  means the app is fully functional with zero relay round-trips.
- **Private by default**: event content is NIP-44-encrypted to the user's own
  key before publishing.
- **Addressable events are files**: the newest event per `(kind, pubkey, d)`
  is the file's content; editing is republishing. Sharing keeps the same
  addressable event — it just drops the encryption.
- **Relays hold state, Blossom holds books**: EPUB files and covers go to
  Blossom servers as sha256-addressed blobs; relay events carry the hash.

The full contract is [the nostr event model](nostr-event-model.md).

### 3. The browser is the primary store.

Local-first. IndexedDB — one database per npub — is the source of truth the
UI reads and writes; relay sync reconciles only on explicit user action. A
library of EPUBs can reach 50–200 MB; that is comfortably inside modern
quotas (Chromium and Firefox allow gigabytes per origin; Safari is the tight
one). We request `navigator.storage.persist()` to resist eviction, and
Blossom backup is the recovery story when a browser evicts anyway.

### 4. Identity is a nostr keypair.

No accounts, no email, no phone number, no KYC. Login is signing with a nostr
key via the [cyphertap](https://github.com/PlebeiusGaragicus/cyphertap)
widget. The npub is the data partition key — switching identities switches
databases. We never see or store keys server-side because there is no server
side.

### 5. Payments are bitcoin.

Lightning and Cashu ecash only. No cards, no fiat rails, no subscriptions
tied to an account (there are no accounts). If in-app payments arrive (paid
AI inference), they are metered and bearer-token-shaped — ecash attached to
requests — and we hold no user funds. Deferred deliberately; the only code
today is a `// PAYMENTS:` seam.

### 6. AI is integrated; inference is sovereign.

The reading-companion AI runs entirely in the browser against an
OpenAI-compatible endpoint the user configures. Users may someday pay for
hosted tokens (with ecash, per principle 5), but **bringing your own
inference endpoint is always a first-class, fully-featured path** — never
gated, never degraded, and actively encouraged. Smart users run LM Studio /
llama.cpp / Ollama and point the app at localhost. API keys and endpoint
config live only in browser storage.

## Anti-features

Things this app will not have, so nobody has to relitigate them: a backend, a
signup flow, fiat payments, custody of funds, mandatory hosted AI, automatic
background relay replication, analytics or telemetry that phones home, an
Electron build, data that exists only on our infrastructure (we have none).

## Status map (2026-07)

| Principle | State |
|---|---|
| 1. Web-first static build | ✅ SvelteKit static adapter, GitHub Pages. nsite publishing: later. |
| 2. Relays as file system | ✅ Explicit Sync (state events + tombstones), Blossom backup/restore, annotation sharing — per the [event model](nostr-event-model.md). |
| 3. Browser primary store | ✅ Per-npub IndexedDB, `storage.persist()` on login. |
| 4. Keypair identity | ✅ cyphertap login, npub-partitioned DBs. |
| 5. Bitcoin payments | ⏳ Deliberate seam only. Do not build ahead of it. |
| 6. Sovereign AI | ✅ BYO CORS-enabled endpoint is the only path (Phase C). |
