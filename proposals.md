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

## 2. Self-hosted Blossom server (candidate)

**Status: idea, 2026-07-12.** Surfaced during Phase D: of seven public
Blossom servers probed, only nostr.download is both browser-CORS-open and
accepts `application/epub+zip` — the public Blossom network is media-CDN
shaped and hostile to arbitrary blobs. A homelab Blossom server
(blossom.abvstudio.net) would make book backup durable and policy-free:
khatru's embedded Blossom package (`khatru/blossom/`) is the natural build,
and the same origin/pubkey policies from proposal 1 apply. Pairs well with
the relay hardening work.
