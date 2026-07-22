# SnowKey Battle repository instructions

## Canonical workspace

- The only active development checkout is this repository root: `D:\vibe_coding\snow-fighting-game`.
- Treat every sibling or legacy workspace as outside this repository's scope. Do not develop, build, test, commit, deploy, or copy `.git` metadata from them.
- Do not delete an external workspace unless the user explicitly asks for that exact deletion.
- Read `PROJECT_CONTEXT.md` and `README.md` before making project changes.

## Product and architecture contracts

- This repository is browser-only. Platform-specific clients belong in their own repositories and must not be added here.
- The Cloudflare Worker and per-room Durable Object are authoritative for room membership, word claims, AI timing, attack order, damage, freeze state, reconnects, host transfer, and victory. Do not duplicate authoritative battle rules in a client.
- Keep shared protocol and rule changes synchronized across `app/`, `shared/`, `worker/`, and their tests.
- Preserve the same-origin compatibility/CSRF boundary for room creation and WebSocket upgrades; use room credentials and server-side abuse controls for security.
- Existing names are intentional: the public product and npm package are `SnowKey Battle` / `snowkey-battle`, while the Worker and public URL still use `snow-fighting-game`.
- The game code has no project-wide open-source license. The bundled ECDICT license applies only to the imported word data.

## Hosting, privacy, and safety

- The primary multiplayer deployment is Cloudflare Workers because it requires WebSockets and Durable Objects. Keep the existing ChatGPT Sites binding separate; do not overwrite one deployment target with the other.
- Preserve `.openai/hosting.json`, `wrangler.jsonc`, Durable Object migrations, and the two Git remotes unless a task explicitly changes them.
- Never commit local credentials, `.env` files, Wrangler state, AppSecrets, reconnect tokens, generated builds, or dependency directories.
- Public Git history must continue to use the GitHub noreply identity. Do not reintroduce a personal email in commit metadata.

## Validation

- For shared/backend changes, run `npm test` and `npm run lint` when practical.
- Run `npm run test:live` only against an explicitly selected running server or deployment; report the exact target URL.
- Before release, a successful Node test suite does not replace an actual two-browser or two-device room test.
