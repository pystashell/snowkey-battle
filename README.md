# SnowKey Battle

> A real-time typing snowball fight across a frozen river.

[Play the live game](https://snow-fighting-game.pystashell.workers.dev/) · [中文说明](#中文说明)

SnowKey Battle is a browser remake of a childhood multiplayer typing game. English words fall as snowflakes: type one before anyone else to catch it, pack it into a snowball, and throw it at the opposing team. The character art is drawn from scratch with CSS and only takes visual inspiration from the warm, rounded winter outfits of [Snowcraft](https://github.com/seanpm2001/Snowcraft); no original Snowcraft sprites or assets are included.

## Highlights

- Real-time room-code multiplayer for up to eight humans, with server-authoritative word claims, damage, formations, and match results.
- Independent team sizes from one to four players, including asymmetric matches such as 1v2 and 2v3.
- Individual 100 HP health bars and formation tactics: new players enter at the back, while the living frontline absorbs incoming snowballs.
- The host can remove AI seats or other human players from the lobby; newly created and vacated AI seats default to Skilled.
- When the host leaves, ownership passes to the earliest remaining human by join order—never to AI.
- English-only typing with seven built-in wordbooks; CET-4 is the default, followed by large CET-6, Postgraduate, TOEFL, and SAT-oriented collections in difficulty order.
- Fully animated catch, pack, wind-up, throw, flight, hit, freeze, and knockdown states.
- Original short snowball sound effects, four locally bundled CC0 winter background tracks, and user-provided Aigei victory/defeat cues, with scene-aware shuffle, pause, volume, and independent music/SFX switches.
- Super Snowflakes use rotating long words, hit the whole enemy team for 15 damage, and freeze survivors for one second.
- Chinese and English interfaces selected from the browser language, with a visible manual switch.

## Quick start

Requirements: Node.js 22.13 or newer.

```bash
git clone https://github.com/pystashell/snowkey-battle.git
cd snowkey-battle
npm ci
npm run dev
```

Open `http://localhost:3000`. Local mode works immediately; the development server also provides the room API and Durable Object used by online mode.

## How online rooms work

1. Choose **Online with Friends**, enter a display name, and create a room.
2. Send the six-character room code or invitation link to friends.
3. Friends open the same deployed URL and join with their own names.
4. The host chooses team sizes, wordbook, snowfall density, formation, and AI difficulty, and may remove AI or other human players.
5. Players ready up and the host starts the match.

The Cloudflare Worker is the referee. Clients only send lobby commands and keystrokes; the server owns snowflake spawning, typing races, queued throws, target locking, health, AI timing, reconnects, and victory. A disconnected human keeps their seat for 60 seconds before AI takes over. Rooms are retired after the final human leaves.

## Tech stack

| Layer | Technology |
| --- | --- |
| UI | React 19, Next.js App Router, TypeScript, CSS animation |
| Build/runtime | vinext and Vite |
| Realtime backend | Cloudflare Workers, WebSockets, Durable Objects |
| Testing | Node test runner, SSR assertions, live two-client WebSocket smoke test |

## Test and deploy

```bash
npm test
npm run lint
```

Run the real-room test suite against a running local server. It includes the
two-client gameplay smoke test plus a roughly 68-second abrupt-disconnect
check that verifies the final human's room cannot be joined after the
reconnect grace period:

```bash
npm run test:live
```

Or test the public deployment:

```bash
SNOW_BATTLE_URL=https://your-worker.workers.dev npm run test:live
```

To run either live check by itself:

```bash
npm run test:live:smoke
npm run test:live:reclaim
```

Deploy your own Worker and Durable Object:

```bash
npx wrangler login
npm run deploy
```

The web app, room API, and WebSocket endpoint share one `workers.dev` origin, so no separate server or cross-origin configuration is required.

## Audio assets

The music menu always shows the current track, artist, CC0 license, and original OpenGameArt source. Lobby and battle choices are stored separately: the cheerful `Happy Synths` is the default lobby track, while the stronger `Black Diamond` starts with the countdown. Selecting a track starts it immediately; selecting a track for the other scene previews it for eight seconds before returning to the current scene. Shuffle stays inside the chosen scene and avoids an immediate repeat when the scene has more than one track.

Music can be paused or disabled, sound effects can be disabled independently, and both have persistent volume sliders. The default music slider is 50%, producing half of the previous tuned output level. The packing and hit sounds are 0.18 and 0.19 seconds respectively, use reduced gain, and limit same-kind overlap during busy battles.

At the result screen, the battle track stops and a one-shot cue plays from the current player's perspective: `游戏胜利提示音效` for a win or `游戏失败` for a loss. Both user-provided Aigei cues can be previewed in the music panel and obey the same music switch, pause control, and volume slider.

Browsers may wait for the first click or key press before allowing sound.

All audio is bundled locally. The four background tracks were published as CC0 on OpenGameArt, while the three game sound effects are reproducible original synthesized waveforms released as CC0 by this project. The two result cues are user-provided Aigei downloads and retain their source terms; they are not relicensed as CC0 by this repository. See [`public/audio/AUDIO_LICENSES.md`](public/audio/AUDIO_LICENSES.md) for the complete source and license record.

## Wordbook data

The CET-4, CET-6, Postgraduate English, TOEFL, and SAT-oriented books are generated from [ECDICT](https://github.com/skywind3000/ECDICT), pinned to revision `bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b`. ECDICT is distributed under the MIT License; its license copy is included in this repository. TOEFL uses ECDICT's `toefl` tag. Because ECDICT has no dedicated SAT tag, the SAT-oriented book combines its TOEFL and IELTS academic-reading tags and is explicitly not an official College Board list. A small set of 18–24-letter game challenge words is added only to CET-4, CET-6, and Postgraduate English and must not be interpreted as an official exam syllabus.

Regenerate the academic wordbooks with:

```bash
npm run generate:wordbooks
```

## 中文说明

一个隔着冰河、靠英文打字抢雪花的童年小游戏重制版。角色采用原创 CSS 绘制，只参考 Snowcraft 圆润、厚实的冬装小人气质，不使用原作精灵或素材。

## 当前玩法

- 两队人数可分别设置为 1–4 人，因此支持 1v1、1v2、2v3、4v4 等非对称阵容。
- 每个角色拥有独立血量；每次雪球都锁定敌方最前排的存活角色，前排倒下后才会打到下一位。
- 阵型可以在开战前调整；全员统一 100 HP，由前排先承伤，后排继续抢词输出。
- 所有单词雪花都是英文，只接受 `a-z` 输入；雪花在空中不会消失，落地后保留 2 秒，随后融化且不能再抢。
- 雪花有三种竞速状态：无人输入、AI 正在输入、玩家当前领先。
- 默认使用大学四级词库；按难度还可选择冬日基础、大学六级、考研英语、托福英语、SAT 英语和混合挑战，共 7 个内置单词册。原有两本小型经典情景英语词册已移除。
- 四级、六级、考研和托福词册来自 ECDICT 的对应考试标签；SAT 词册由 ECDICT 的 TOEFL/IELTS 学术阅读标签整理，是 SAT 备考向游戏词包，不是 College Board 官方词表。仅四级、六级和考研词册另加入少量用于游戏的 18–24 字母长词挑战补充。
- 普通词与超级雪花词分别使用无放回洗牌袋，并回避近期出现过的词；每册最长的 10 个词轮换为超级雪花，完整一轮前不会重复。
- 超级雪花命中对方所有存活角色 15 点，并把他们冻住 1 秒；普通雪球只攻击锁定时的敌方前排。
- 雪量有舒缓、标准、暴雪三档；每次出雪间隔都会随机变化，并偶尔形成短阵雪或空档。
- 房主可在大厅移除 AI 或其他真人；新增、补位和真人离开后留下的 AI 默认使用熟练难度。
- 房主主动离开后，房主身份严格按加入顺序交给下一位真人，永远不会交给 AI。
- 抢到单词后会完整播放抓取、攥雪球、蓄力投掷、飞行和受击动画。
- 大厅与战斗分别选择并记住音乐：大厅默认播放轻快的 `Happy Synths`，倒计时开始后切换到更有冲劲的 `Black Diamond`；每首歌都显示作者、CC0 许可和 OpenGameArt 出处，并支持分场景随机、暂停/继续、音乐与音效独立开关和独立音量。
- 进入结算画面时，系统会从当前玩家视角自动播放一次用户提供的爱给网胜利音 `游戏胜利提示音效` 或失败音 `游戏失败`；两段音乐都能在声音面板试听，并受音乐开关、暂停和音乐音量统一控制。
- 攥雪球与雪球命中音效分别只有 0.18 秒和 0.19 秒，同类声音会限制并发，避免多人连续投掷时叠成持续噪声。

## 判定与数值

- 未锁定时，每次有效按键会检查场上全部单词的前缀。候选只剩 1 个时就锁定该雪花，后续只检查这个目标；`Space` 或 `Esc` 可以放弃。
- 完成单词会立即记为抢到并进入该角色的动作队列。连续快速完成多个词不会丢球，同一角色的抓取和投掷动画按 1.85 秒间隔依次播放。
- 雪球只有飞到对岸时才结算伤害；角色被打倒后，尚未投出的库存雪球作废，已经发射并在空中飞行的雪球仍会继续结算。
- 基础伤害按长度分为 10 / 11 / 12 / 13：1–5、6–8、9–11、12–24 个字母各一档。因此只看词长时，最长词最多是短词的 1.3 倍；游戏只接受 2–24 个小写英文字母组成的单词。
- 真人连击每 5 个词增加 1 点，最多额外 2 点；主要收益仍来自抢到更多雪球。
- 舒缓、标准、暴雪的基础出雪区间分别是 1400–1900、850–1250、520–780 毫秒；人数越多会小幅加快，18% 概率出现短阵雪、10% 概率出现较长空档，并受场上单词上限保护。

现在同时支持两种模式：本机 AI 战术演练，以及真正的远程房间码联机。联机房间由服务器统一生成单词、裁定抢词顺序、选择前排目标、扣血和宣布胜负；客户端只发送按键与大厅操作，因此不同电脑看到的是同一局比赛结果。

## 房间码联机

1. 首页选择“好友联机”，输入昵称后点击“创建房间”。
2. 房主复制 6 位房间码或邀请链接发给朋友。
3. 朋友打开同一个已部署网址，输入房间码加入；最多 8 位真人。
4. 房主可分别设置两队 1–4 人、单词册、雪量，移除 AI 或其他真人，并为无人占用的席位设置 AI 强度；新加入的真人默认站在队尾。
5. 玩家选择队伍并准备，房主点击“开始对战”。人数可以不对称，例如 1v2、2v3。

刷新网页会使用保存在本机浏览器中的房间凭据自动重连。意外掉线的席位保留 60 秒，超过宽限期后由 AI 接管；房主显式离开时，最早加入的剩余真人自动接任。最后一位真人显式离开，或最后一个掉线席位超过宽限期后，房间会立即回收；6 小时无活动回收仍作为兜底。

## 本地运行

```bash
npm install
npm run dev
```

浏览器打开 `http://localhost:3000`。

## 词库来源与更新

大学四级、大学六级、考研英语、托福英语和 SAT 备考向词册由 [ECDICT](https://github.com/skywind3000/ECDICT) 的 `ecdict.csv` 生成，固定使用修订版 `bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b`。托福词册直接采用 `toefl` 标签；ECDICT 没有独立 SAT 标签，因此 SAT 词册合并 `toefl` 与 `ielts` 标签，并明确标注为非 College Board 官方词表。ECDICT 使用 [MIT License](https://github.com/skywind3000/ECDICT/blob/bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b/LICENSE)；仓库同时保留许可证副本。生成器只保留 2–24 个小写英文字母组成的词并自动去重。

为让超级雪花有足够明显、足够多样的长词，游戏另外维护一小组 18–24 字母的长词挑战补充，并只合入四级、六级和考研三本词册。它们是游戏内容，不应被理解为 ECDICT 标注的四级、六级或考研词汇。重新生成 ECDICT 数据可运行：

```bash
npm run generate:wordbooks
```

本地地址只能给这台电脑使用。要让外地朋友加入，需要先把同一套 Worker 和 Durable Object 部署到 Cloudflare：

```bash
npx wrangler login
npm run deploy
```

部署成功后，把命令输出的 `https://...workers.dev` 地址发给朋友。房间、WebSocket 和网页使用同一个域名，不需要另搭一台后端服务器。

## 验证

```bash
npm test
npm run lint
```

开发服务器运行时，还可以另开一个终端执行真实双 WebSocket 冒烟测试：

```bash
npm run test:live
```
