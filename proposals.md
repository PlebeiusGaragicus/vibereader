# Proposals

Ideas evaluated but not yet built. Each entry records the design thinking so
future work doesn't start from scratch. Move an entry into the roadmap
(CLAUDE.md) when it's accepted; delete it if rejected — and say why.

---

## 1. Application-specific relay (relay.abvstudio.net hardening)

**Status: proposed, 2026-07-12.** No changes made; the relay currently runs
strfry 1.0.4 (per its NIP-11: negentropy enabled, no NIP-42, write access
whitelisted to the test accounts).

Goal: make the self-hosted relay serve *only* the plebchat.me family of
nostr-ecosystem apps (vibereader, socratic-seminar, …) instead of being a
general-purpose relay anyone can use.

### Layer 1 — Origin allowlist at the reverse proxy (cheap, do first)

strfry can't filter by HTTP header, but the reverse proxy terminating TLS
can reject WebSocket upgrades whose `Origin` isn't an allowed app origin:

```nginx
# inside the relay's location block, before proxy_pass
if ($http_origin !~* ^https://plebchat\.me$) { return 403; }
```

**Security properties — understand exactly what this buys:**

- Browsers set the `Origin` header themselves; page JavaScript **cannot**
  override it on a WebSocket. And WebSockets are not subject to CORS at all,
  so *without* this check any website on the internet can silently connect
  its visitors' browsers to the relay. The allowlist reliably blocks that
  entire class of freeloading.
- Outside a browser (curl, nak, bots, native apps) `Origin` is just a header
  anyone can type. **This is hygiene, not authentication** — a determined
  client spoofs it in one flag.

Caveat: local development (`http://localhost:*`) needs an allowance or a
separate dev relay entry.

### Layer 2 — Kind + pubkey write policy (real enforcement)

The truest "application-specific relay": a strfry write-policy plugin (the
stdin/stdout newline-JSON contract; `noteguard` in the reference collection
is the model, and the existing test-account whitelist presumably already
uses this hook) that rejects any event that isn't shaped like our apps:

- **Kind allowlist**: vibereader uses 30101–30104, 9802, 10063, 24242
  transits (never stored), 5; socratic-seminar will add its own block.
  Everything else → reject.
- **Pubkey policy**: today the whitelist; for a real user base the options
  are invite-based enrollment, web-of-trust, or payment-gated (ecash fits
  the philosophy).

This is cryptographically grounded (events are signed by the pubkey) and
cannot be spoofed. Write policies compose with Layer 1, not replace it.

### Layer 3 — Authenticated reads (deferred; requires different software)

strfry write policies only see *writes* — there is no hook to restrict
queries, and strfry doesn't implement NIP-42 AUTH. Today anyone who knows a
user's pubkey can REQ their events: content is NIP-44-encrypted, but
ciphertext existence, kinds, timestamps, and event counts are visible
metadata. If that ever matters, the fix is NIP-42-gated reads, which means
khatru (as the relay, or as a filtering front layer) with
`RejectConnection`/`RejectFilter` hooks. This is a software migration, not a
config change — defer until metadata privacy is a real requirement.

### Recommendation

Do Layers 1 + 2 together (proxy origin allowlist + kind/pubkey write
policy); treat Origin as noise reduction and the write policy as the actual
boundary. Revisit Layer 3 only when read-metadata privacy becomes a stated
goal.

---

## 2. foliate-js migration (renderer swap)

**Status: ACCEPTED 2026-07-12 — next priority, alongside mobile polish.**

epub.js (`epubjs@0.3.93`) is effectively abandoned: last release 2023, no
active maintainer, CJS with a legacy dependency chain, and the quirk list we
already design around (ArrayBuffer-only loading, pre-render annotation
crashes, no click coordinates from `markClicked`, expensive locations
generation). It works today; it will only rot. The successor is
**foliate-js** (johnfactotum/foliate-js, MIT) — zero dependencies, modern
ESM, actively maintained, own spec-correct EPUB CFI implementation, built-in
annotation overlay and paginator, and it reads MOBI/KF8/FB2/CBZ too (free
format expansion). Readest is built on it. The heavyweight alternative
(Readium/Thorium) was considered and rejected as an oversized commitment.

**Why the swap is cheap by design:**

- All epub.js contact is isolated in `src/lib/epub/service.ts` +
  `import.ts` — the rest of the app speaks our own vocabulary (`openBook`,
  `applyAnnotation`, `onSelection`, `compareCfi`, …). The migration is a
  two-file rewrite against an existing contract, not an app rewrite.
- **No data migration**: book identity is the file's sha256
  (renderer-independent) and annotation positions are standard EPUB CFI
  strings, which foliate-js resolves natively. Every annotation already in
  IndexedDB or on relays keeps working.

**Migration plan:**

1. **Vendor foliate-js** (it ships as source ESM modules, no npm package) —
   same pattern as cyphertap's vendored negentropy. Pin a commit; record it.
2. **Spike**: reimplement `service.ts` on foliate-js's `View` /paginator/
   overlayer against the current function signatures; `import.ts` metadata +
   cover extraction next. Acceptance = the existing Phase B playwright suite
   passes unchanged (import, paginate, themes, resume, annotate in two
   chapters, spine-order sidebar, reload persistence).
3. **Behavior checks specific to the swap**: CFI compatibility against
   annotations created under epub.js (open an old library); locations/
   percentage model (foliate-js computes progress differently — the
   `locations` cache table may become obsolete; keep the store, change the
   payload); selection/annotation-click coordinate pipeline (foliate-js
   gives real events — should *delete* our iframe-rect workarounds).
4. **Cleanup**: drop `epubjs` from package.json and `optimizeDeps`, remove
   epub.js-specific gotchas from CLAUDE.md, note the format expansion
   (accept `.mobi`/`.fb2`/`.cbz` in import — sha256 identity works for any
   file type; kind 30101 is already format-agnostic).

**Risks**: foliate-js's API is less documented than epub.js (read Readest's
usage as the reference consumer); vendoring means we own updates (pin +
periodic bump, upstream-first if we need patches).

## 3. Mobile polish (paired with the renderer swap)

**Status: ACCEPTED 2026-07-12.** Scope sketch: touch/swipe page turns,
responsive layout for the sidebars (drawer-ify TOC/annotations/chat on small
screens), selection UX on touch (long-press), viewport/safe-area handling,
and PWA installability (manifest + icons — shipped 2026-07-12; see
`static/manifest.webmanifest`). **Known iOS caveat to design for**: a
Home-Screen-installed PWA gets its own storage partition on iOS — IndexedDB
does NOT carry over from the Safari-tab session, so a user who installs the
app starts with an empty library. Relay sync + Blossom restore is the
built-in answer (log in, Sync, restore) — the install flow should say so.

## 4. Self-hosted Blossom server (candidate)

**Status: idea, 2026-07-12.** Surfaced during Phase D: of seven public
Blossom servers probed, only nostr.download is both browser-CORS-open and
accepts `application/epub+zip` — the public Blossom network is media-CDN
shaped and hostile to arbitrary blobs. A homelab Blossom server
(blossom.abvstudio.net) would make book backup durable and policy-free:
khatru's embedded Blossom package (`khatru/blossom/`) is the natural build,
and the same origin/pubkey policies from proposal 1 apply. Pairs well with
the relay hardening work.
