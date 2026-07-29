# SnowKey Battle release guide

This repository's first public browser release is `1.0.0`.

## Supported deployment targets

| Target | Local AI | Online rooms | Upload unchanged? | Intended use |
| --- | --- | --- | --- | --- |
| Cloudflare Workers | Yes | Yes | Yes | Canonical public game |
| ChatGPT Sites | Yes | No custom Durable Object service in the current binding | Front end only | Separate page/local-mode surface |
| GitHub Pages | Static page only after a separate export | No | No | Project or marketing page |
| Netlify or Vercel | Front end possible | Requires a separately designed stateful WebSocket backend | No | Alternative split architecture |
| Traditional Node/VPS | Possible | Possible after replacing the Worker and Durable Object adapters | No | Self-managed infrastructure |

The browser, room API, WebSocket endpoint, and per-room Durable Object deliberately share one Cloudflare origin. Moving only the page to another host would require a configurable backend URL, cross-origin policy changes, reconnect/security review, and a separate backend deployment. It is not a different ZIP of the same build.

Platform-specific native clients are separate products and do not belong in this repository.

## Production checklist

1. Use Node.js 22.13 or newer and install exactly from `package-lock.json` with `npm ci`.
2. Run `npm test`, `npm run lint`, and `npm run deploy:dry`.
3. Confirm `npm audit --omit=dev --omit=optional` has no production findings. Optional native image tooling is not used by this game or shipped in the Worker bundle.
4. Confirm `.env*`, `.dev.vars*`, `.wrangler/`, generated builds, dependency folders, reconnect tokens, and local preview files are not tracked.
5. Retain the source/license records in `public/audio/AUDIO_LICENSES.md` and the bundled ECDICT license.
6. Confirm the publisher has redistribution rights for both user-provided Aigei result cues. If not, replace them before promotion.
7. Test one complete online match in two independent browser profiles or two devices. Verify room creation, invitation, ready/start, typing race, damage, result, explicit leave, and reconnect.
8. Deploy with `npm run deploy`.
9. Run `SNOW_BATTLE_URL=https://snow-fighting-game.pystashell.workers.dev npm run test:live`.
10. Verify the public page, `/api/rooms/health`, security headers, privacy page, social preview image, and the deployed Cloudflare version.

## Release identity

- Product: `SnowKey Battle`
- npm package: `snowkey-battle`
- Worker and legacy public URL: `snow-fighting-game`
- Canonical URL: <https://snow-fighting-game.pystashell.workers.dev/>
- Source: <https://github.com/pystashell/snowkey-battle>
- Browser version: `1.0.0`

The repository intentionally has no project-wide open-source license. Third-party data and audio keep their own licenses or source terms.
