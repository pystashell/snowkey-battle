# SnowKey Battle project context

Last handoff update: 2026-07-24

## Product goal

SnowKey Battle recreates a childhood typing snowball fight. Two teams stand on opposite riverbanks. English words fall as snowflakes; the first player to finish a word catches it and queues a snowball attack. The server, not a client, decides races, attacks, health, and the winner.

Current product rules that should be treated as established decisions:

- One to four seats per team, up to eight human players, including asymmetric matches.
- Every living player has 100 HP. Normal snowballs lock onto the living enemy frontline; formation order therefore matters.
- Every human chooses a unique display name and may move their own seat. The host can arrange all seats and remove AI or other humans.
- The creator is the first host. If the host explicitly leaves, ownership passes by human join order; AI can never be host.
- Refreshing or closing a page is a disconnect, not a leave. The seat is held for 60 seconds and then taken over by AI. An explicit leave is immediate.
- Completed words enter a per-character action queue. Catch, pack, wind-up, throw, flight, hit, freeze, and knockdown are visible; queued actions are spaced by 1.85 seconds.
- Packing, impact, and knockdown have synchronized game sound effects. Packing and impact are 0.18/0.19-second synthesized transients with same-kind throttling. Four locally bundled CC0 winter tracks are split into lobby and battle pools; each scene remembers its own selection or shuffle mode. Every track shows its author, CC0 license, and original OpenGameArt source in the music menu. User-provided Aigei victory and defeat cues play once from the current player's perspective at match end, can be previewed from the same panel, and retain their source terms rather than being relicensed as project CC0 assets.
- Music has pause/resume, a persistent 50%-by-default master level (half the previous tuned output), and a separate persistent SFX level. Music and SFX can also be disabled independently.
- The selected book's ten longest words rotate without replacement as Super Snowflakes. They hit every living opponent for 15 damage and freeze survivors for one second.
- CET-4 is the default wordbook. The selector orders CET-4, CET-6, Postgraduate, TOEFL, then SAT-oriented by difficulty; the two former small situational books are retired. All five academic books are generated from ECDICT revision `bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b`. TOEFL uses the source `toefl` tag, while SAT combines TOEFL/IELTS tags and is not an official College Board list. Separate 18-24-letter challenge additions remain game content only in the CET-4, CET-6, and Postgraduate books.
- The room service uses a 15-second ping, reconnect backoff of 0.5/1/2/4/7.5/10 seconds, a 60-second disconnect grace period, and a six-hour idle-room fallback TTL.

## Current architecture

- `app/`: React 19 / Next.js browser client, local AI mode, online lobby, animation, localization, and wordbooks.
- `public/audio/`: locally served music and synthesized sound effects, with source and license records.
- `shared/game-protocol.ts`: messages and public room snapshots shared with the authoritative backend.
- `shared/room-engine.ts`: room rules, AI, attacks, health, reconnect behavior, and host transfer.
- `worker/GameRoom.ts`: one Durable Object per room, using hibernating WebSockets and storage.
- `worker/index.ts`: HTTP room creation, WebSocket routing, assets, health endpoint, and request-origin checks.
- `tests/`: core rules, rendering, word pools, localization, and live two-client smoke coverage.

The browser page, API, and WebSocket normally share the Cloudflare origin. ChatGPT Sites can host the page, but the currently bound Sites runtime does not provide this project's custom Durable Object room service; the live multiplayer source of truth remains Cloudflare.

## Public identity and deployments

- GitHub: `https://github.com/pystashell/snowkey-battle`
- Primary live game: `https://snow-fighting-game.pystashell.workers.dev/`
- Git remote `origin` is the public GitHub repository.
- Git remote `sites` and `.openai/hosting.json` belong to the separate ChatGPT Sites surface; its history must not be merged blindly into the GitHub branch.

## Repository scope

This repository contains only the browser client and its authoritative Cloudflare room service. Platform-specific clients are maintained separately and are outside this repository's development, testing, build, deployment, and Git scope.
