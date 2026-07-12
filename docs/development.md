# Development

## Clone & run

```sh
git clone --recurse-submodules https://github.com/PlebeiusGaragicus/vibereader
cd vibereader
pnpm install
pnpm dev
```

The [cyphertap](https://github.com/PlebeiusGaragicus/cyphertap) login/wallet
widget is a git submodule consumed from source as a pnpm workspace package —
a clone without `--recurse-submodules` leaves `cyphertap/` empty and
`pnpm install` fails resolving `workspace:*`.

Copy `.env.example` to `.env` (gitignored) to pre-fill the AI settings form
in dev.

## Checks & build

```sh
pnpm check                          # svelte-check (CI-enforced)
pnpm check:lib                      # cyphertap's own check
BASE_PATH=/vibereader pnpm build && pnpm preview   # what CI/Pages runs
```

Always test against the `BASE_PATH` build before calling UI work done —
asset-path bugs only appear there.

## Docs site

```sh
pip install -r docs-requirements.txt
mkdocs serve                        # http://127.0.0.1:8000
```

CI builds the docs with `mkdocs build --strict` into `build/docs/`, so the
deployed app serves them at `/vibereader/docs/`.

## Submodule rules (cyphertap)

Changes flow **upstream first** (the cyphertap repo), then bump the pointer
here. After any dep-changing bump, run `pnpm install` and commit the
lockfile — CI's `--frozen-lockfile` fails on unsynced bumps by design. See
cyphertap's `docs/CONSUMING.md`, Pattern B.

## Verification conventions

- Verify UI changes with playwright screenshots (available via
  `cyphertap/node_modules/playwright`), not curl.
- Test accounts: the whitelisted alice/bob/carol keypairs in
  `../my-projects/.test-accounts.json` (they may publish to the test relay
  `wss://relay.abvstudio.net`).
- Keep test EPUBs out of git; use small public-domain files.
- For sync work (Phase D): `nak serve` spins up a throwaway local relay.
