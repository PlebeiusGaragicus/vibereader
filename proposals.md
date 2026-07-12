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

## 4. Self-hosted Blossom server (blossom.abvstudio.net)

**Status: proposed with concrete plan, 2026-07-12** (was: idea). Surfaced
during Phase D: of seven public Blossom servers probed, only nostr.download
is both browser-CORS-open and accepts `application/epub+zip` — the public
Blossom network is media-CDN shaped and hostile to arbitrary blobs. And
nostr.download prunes: a book whose 30101 synced fine 404'd on restore
because its bytes were never (or no longer) there. A homelab server makes
book backup durable and policy-free.

**Build choice: `blossom-server/`** (hzrd149, canonical standalone
implementation — now in the reference collection). Deno + Docker Compose,
one YAML config, CORS open by default, BUD-01/02/04/05/06/08/09/11. It
solves both public-network failures directly: no CORS wall, and the MIME
retention rules double as an upload allowlist we control. The alternative —
khatru's embedded `blossom` package inside a future custom relay binary
(proposal 1 Layer 3) — was set aside: it's a Go build we'd own, whereas
blossom-server is deploy-and-configure today. Revisit only if the khatru
migration happens anyway.

### Deployment sketch

`git clone hzrd149/blossom-server && cp config.example.yml config.yml`,
then `docker compose up -d` behind the existing reverse proxy. The config
that matters (everything else can stay default):

```yaml
publicDomain: "blossom.abvstudio.net"   # bare hostname, no scheme

upload:
  enabled: true
  requireAuth: true            # BUD-11 kind-24242 events (client already sends them)
  # Closed server: uploader's pubkey must appear in a rule below.
  requirePubkeyInRule: true

storage:
  backend: local
  # Rules are ordered; first match wins. They are ALSO the upload allowlist
  # (unmatched MIME → 415). `expiration` is required and counts time since
  # last access — "10 years" ≈ never for an active library.
  rules:
    - type: "application/epub+zip"
      expiration: 10 years
      pubkeys:                 # our npubs (hex) — test accounts + real identities
        - "<alice-hex>"        # see ../my-projects/.test-accounts.json
        - "<bob-hex>"
        - "<carol-hex>"
    - type: "image/*"          # book covers ride along with backups
      expiration: 10 years
      pubkeys: [same list]

list:
  enabled: true                # GET /list/<pubkey> — handy for a "my blobs" audit
  requireAuth: true
  allowListOthers: false

# dashboard: enable ad hoc for operator review; keep off day-to-day
```

Reverse-proxy notes: raise the body-size cap (EPUBs run tens of MB, e.g.
`client_max_body_size 200m` in nginx) and pass the Host header through so
`publicDomain` agrees with blob URLs. The Origin-allowlist hygiene from
proposal 1 Layer 1 applies here too, with the same caveat (hygiene, not
auth — `requireAuth` + pubkey rules are the real boundary).

### App-side wiring (no code changes)

Blossom servers are already user-editable in Settings and published as
kind 10063; backup/restore/probing already speak plain BUD-01/02. Rollout:
add `https://blossom.abvstudio.net` as the *first* server in Settings
(uploads go to the first server, per the event model), keep nostr.download
as a second copy, re-run "Back up" per book, and confirm via the book-info
dialog's availability probe (added 2026-07-12), which HEADs every
configured server. One real gotcha to verify at deploy time: the BUD-11
base64 quirk — deployed servers accept STANDARD base64 auth, not the
spec's base64url (`blossom.ts` sends standard; nak agrees). Test with
`nak blossom upload --server https://blossom.abvstudio.net <file>` before
pointing the app at it.

## 5. Ghost books + browsing other libraries (social reading)

**Status: ACCEPTED + implemented 2026-07-12 (all three phases; see PLAN.md
for the implementation record until it lands in a commit).** Origin: VibeReaderTwo's
`docs/technical/specification.md` §3.5 ("Social & Collaborative Features" —
discovery panel, browse someone's library, read-only annotation views). All
of it was unimplemented checkboxes there; the concepts fit the rebuilt event
model far better than the original, because sha256-as-book-identity makes
cross-user matching trivial. Three phases, each independently shippable.

### Phase A — Ghost books (no protocol change, small)

A **ghost book** is a book whose metadata + annotations are on this device
but whose file bytes are not. Sync already produces them (30101/30104 pull
regardless of file presence) — the app just refuses to do anything useful
with one: today, opening it toasts "restore first."

Change: opening a ghost book renders a read-only annotations view instead of
the reader — cover (if cached), title/author header, all highlights and
notes spine-sorted with quotes and colors, restore CTA at top. Everything
needed is already local: `compareCfi` is file-independent (bare `EpubCFI`),
annotations carry their own quotes. You can reread every highlight of a
16 MB book you never downloaded to this phone.

Implementation: `ui.view` gains a `ghost` state (or `reader` branches on
file presence); one new component reusing the annotation-list rendering;
`library.open()` routes to it when `missingFiles[sha]`.

### Phase B — Public shelf + browse someone's library (protocol addition)

Privacy rule 2 means a library is invisible by default — 30101 content is
NIP-44 to self. Browsing therefore shows exactly what a user has **chosen
to share**. Today only annotations are shareable (plaintext 30104); books
need the same treatment:

- **Protocol change (`docs/nostr-event-model.md`)**: a shared 30101 — the
  same event, same `d`, republished with plaintext content plus the same
  `i`/`k` ISBN tags as shared 30104s. Mirrors design rule 4 exactly; stays
  addressable/editable/unshareable. `Book.shared?: boolean` field; the push
  codec branches like `annotationDraft` already does. A shared 30101 that
  records `blossom.servers` makes the book itself fetchable by friends
  (public-by-hash) — the existing backup warning already covers this, and
  it becomes the "borrow from a friend's shelf" path: import-by-download
  with sha256 verification.
- **Browse UI** (library header → "Browse"): enter an npub, or pick from
  follows — `cyphertap.getFollows()` exists (kind 3), profile names via one
  `fetchEvents({kinds:[0], authors})`. Fetch
  `{kinds:[30101,30104], authors:[them]}`, keep only plaintext-parseable
  events (their encrypted ones are noise to us), group 30104s by `x` tag.
  Shelf view: their shared books (title/creator from plaintext 30101, cover
  via `blossom.coverSha256` when present) + annotation counts; sha256 match
  against my library shows "you have this book." Read-only, session-memory
  only — nothing foreign enters the per-npub DB, nothing is published by
  browsing (the fetch itself is behind the explicit Browse action).
- **Readers of this book**: from any book I own, the one-query the event
  model was designed for — `{kinds:[30104], "#x":[sha256]}` — lists
  everyone who shared annotations on it.

Known limitation (accepted for v1): we query only our configured relays, so
we see what they published where we look. relay.primal.net in the defaults
gives decent reach; a NIP-65 lookup of the target's write relays (cyphertap
already reads kind 10002 internally) is the future upgrade, not a blocker.

### Phase C — Multi-perspective reading (needs B)

When reading a book someone I browsed also shared annotations on, overlay
their highlights in my reader — read-only, visually distinct (underline vs
fill), toggleable per person in the annotations sidebar. This is
VibeReaderTwo's "multi-perspective reading" and the payoff feature; CFIs
resolve because same sha256 = same file = same CFIs. Defer popular-highlight
aggregation (Kindle-style counts) until real usage exists.

Sequencing: A → B → C, each shippable alone. A is pure client; B is the
protocol addition + browse surface; C builds on B's data with reader-side
rendering.
