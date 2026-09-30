# SnowKey Battle project context

Last handoff update: 2026-10-01

## Audit corrections verified locally on 2026-10-01 (Asia/Shanghai)

The referenced audit reviewed `ec33823`; this checkout started at `0cb421c`.
The audit PR targets `codex/release-v1.0.0` (`0cb421c`) so that the existing
release preparation stays outside its diff. No production deployment was performed.

| Audit item | Reproduction and correction |
| --- | --- |
| Stale shared prefix | Before-fix engine test retained `s` after both `snow` and `star` were claimed. Claim and expiry now share input reconciliation; `r` can immediately start `river`. |
| Hidden rejected prediction | Two real browser clients delayed a final letter until an opposing Super Snowflake froze its sender. The server rejected it and the word returned to the screen. Predictions now retain command IDs and sequences and settle against the snapshot's processed-command watermark; earlier snapshots keep later predictions. |
| Invalid command/configuration | Before-fix engine test accepted `constructor` as a wordbook. Enums now require own keys; a shared operation-specific validator rejects malformed WebSocket arguments before engine work, persistence or broadcasting. |
| Reconnect sequence reset | A real React hook with blocked storage sent sequence 1 after previously sending 50. Same-session reconnect now preserves the maximum in-memory/persisted sequence; welcome additionally reconciles the server watermark. |
| Half-open connection | The original hook stayed connected after 46 seconds with no received frames. A 45-second receive watchdog (15 seconds for initial welcome) now starts backoff without waiting for a close event. |
| System text input/IME | Text input is the letter entry point; composition commits once, physical keydown does not duplicate it, and compact-keyboard pointer input still reaches the server. Browser emulation and DOM composition tests passed; physical mobile IME devices were not tested. |
| Request/command budgets | Creation/join admission is checked before room allocation/routing. Durable budgets use the existing namespace and hashed address keys, expire after 10 idle minutes, and retain no raw IP in storage. Socket budgets survive hibernation in attachments. Origin checks remain first. |
| Consecutive events | The original hook lost the first of two different-revision events delivered in one React batch. A consumed event queue now preserves both. This checkout's engine already defers multiple events; same-revision/index testing is additional protocol hardening, not a proven current-engine emission bug. |
| Reconnect animation | A real guest browser reloaded after a snowball had launched, recovered the pending attack from welcome, rendered the elapsed flight with negative animation delay, and received its impact. Server times are used without adding a new local actor queue. |

Word pools are cached lazily per book and engine instance without changing bags,
history or serialization. The redundant socket `playerId` attachment was removed.
The larger suggestions to split full-state persistence, consolidate all local-mode
rules, and decompose the whole game component remain separate architecture work;
acknowledged-state durability was preserved. Existing starter D1 scaffolding was
already removed by the baseline release work; no unrelated deletion was made.

Validation: the full `npm test` chain passed 95 tests including typecheck and
production build; the subsequently added consecutive-revision regression also
passed (`npm run test:network`: 17/17), bringing the suite to 96 tests. Lint passed.
`npm run test:live` targeted **http://127.0.0.1:3000**: gameplay/host-transfer/kick
checks passed and abrupt disconnect reclaimed the room after about 68 seconds.
Two isolated Chromium profiles completed a real 1v1 match with matching winner
and health. Evidence: `test-results/audit-browser.json` plus four screenshots;
the browser test is reproducible through `tests/browser-audit.mjs`. The in-app
browser runtime could not start because Windows sandbox ACL initialization failed,
so the test used a separate headless Chromium process. A GitHub Actions workflow
is included to run the automated test/build/typecheck chain and lint on PRs.

Known observations outside the supplied audit's correctness fixes:

- Local preview metadata still resolves the favicon to the production origin,
  which the existing same-origin image CSP blocks. The browser test records this
  exact warning separately; it found no other console errors.
- A fresh `npm audit --omit=dev --omit=optional` reports 3 existing dependency
  findings (Next: critical; nanoid: high; baseline-browser-mapping: moderate).
  These package versions were not changed by this repair. This is a dependency
  scanner result, not proof the advisory paths are reachable in the vinext Worker.
  The older release audit below is historical and must not be described as current.

## v1.0.0 release candidate

- The public-browser release candidate is on `codex/release-v1.0.0`; it has not yet been tagged or deployed to the production Worker.
- Release work adds current framework and Cloudflare dependencies, removes unused starter D1 scaffolding, publishes canonical/social/manifest/robots/sitemap metadata, adds a bilingual privacy notice and release footer, and applies document security headers plus structured Worker error logs. The authoritative room protocol and battle rules are unchanged.
- `RELEASE.md` is the platform matrix and launch checklist. Cloudflare Workers remains the only unchanged full-game target; ChatGPT Sites stays a separate local-mode/page surface.
- Validation completed on 2026-07-29: 77 Node tests, lint, typecheck, production build, zero findings from `npm audit --omit=dev --omit=optional`, generated-Worker dry deployment, local live room smoke/reclaim tests, and a complete match in two independent browser profiles. The browser pair agreed on room membership, readiness, match start, health, knockout state, and the Berry-team result; the controlled browser logged no warning or error.
- A full development-tree audit still reports 11 high advisories: the ESLint-only chain is affected by `brace-expansion`/`minimatch`, while Next is reported only through its optional native `sharp` dependency. Neither chain is present in the audited production Worker dependency set; do not describe the full audit as clean.
- The remaining promotion gate is publisher confirmation that the two Aigei result cues may be redistributed publicly, or replacement with cleared alternatives. After that confirmation, deploy the Worker, rerun the live suite against the exact production URL, verify the deployed Cloudflare version, then tag/publish `v1.0.0`.

## Product goal

SnowKey Battle recreates a childhood typing snowball fight. Two teams stand on opposite riverbanks. English words fall as snowflakes; the first player to finish a word catches it and queues a snowball attack. The server, not a client, decides races, attacks, health, and the winner.

Current product rules that should be treated as established decisions:

- One to four seats per team, up to eight human players, including asymmetric matches.
- Every living player has 100 HP. Normal snowballs lock onto the living enemy frontline; formation order therefore matters.
- Every human chooses a unique display name and may move their own seat. The host can arrange all seats and remove AI or other humans.
- The creator is the first host. If the host explicitly leaves, ownership passes by human join order; AI can never be host.
- Refreshing or closing a page is a disconnect, not a leave. The seat is held for 60 seconds and then taken over by AI. An explicit leave is immediate.
- Completed words enter a per-character action queue. Catch, pack, wind-up, throw, flight, hit, freeze, and knockdown are visible; queued actions are spaced by 1.85 seconds.
- A short 0.15-second confirmation cue plays only when the current human claims a snowball; packing, impact, and knockdown retain their synchronized game sound effects. Claim, packing, and impact are synthesized transients with same-kind throttling. Four locally bundled CC0 winter tracks are split into lobby and battle pools; each scene remembers its own selection or shuffle mode. Every track shows its author, CC0 license, and original OpenGameArt source in the music menu. User-provided Aigei victory and defeat cues play once from the current player's perspective at match end, can be previewed from the same panel, and retain their source terms rather than being relicensed as project CC0 assets.
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
