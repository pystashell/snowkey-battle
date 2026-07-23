# SnowKey Battle 网页版音频素材与许可

本目录中的音频全部随 SnowKey Battle 网页版在同一站点发布。浏览器通过
`/audio/music/` 和 `/audio/sfx/` 路径读取本地静态资源，不会热链或请求
OpenGameArt 或爱给网的文件，因此播放过程不依赖第三方音频站点。

## 自制游戏音效

以下三段音效不含录音、采样包或第三方素材，由
[`scripts/generate-web-sfx.mjs`](../../scripts/generate-web-sfx.mjs)
以确定性的数学波形和伪随机噪声合成。项目仅将这三段生成音效按
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
发布，可复制、修改及用于商业项目，无需署名。

| 用途 | 浏览器资源路径 | 声音设计 |
| --- | --- | --- |
| 搓、压实雪球 | `/audio/sfx/snowball-pack.wav` | 0.18 秒的雪粒摩擦、抓紧与短促“咯吱”压实声 |
| 雪球击中 | `/audio/sfx/snowball-hit.wav` | 0.19 秒的柔和雪团接触、碎雪爆开声，无金属或长共鸣尾音 |
| 角色倒下 | `/audio/sfx/player-down.wav` | 下坠音高、柔和落地冲击和雪面沉降尾音 |

重新生成三段自制音效：

```powershell
node scripts/generate-web-sfx.mjs
```

## 用户提供的胜负结算音乐

以下两个 MP3 由用户从爱给网下载后提供。文件本身没有嵌入作者、版权或许可证
元数据，因此本项目不会把它们标为 CC0，也不会对其重新授权。使用与分发应遵守
下载时对应爱给素材页面及用户账户所取得的条款；请保留原始下载记录或购买授权凭证。
胜负以当前玩家所在队伍为准，结算时只播放一次；声音面板也可手动试听。

| 用途 | 下载文件名 | 时长 | 爱给网来源分类 | 浏览器资源路径 |
| --- | --- | --- | --- | --- |
| 胜利 | `游戏胜利提示音效_爱给网_aigei_com.mp3` | 约 6 秒 | [游戏胜利配乐/音效](https://www.aigei.com/sound/class/you_xi_she_72/) | `/audio/music/aigei-game-victory.mp3` |
| 失败 | `游戏失败_1683890_爱给网_aigei_com.mp3` | 约 2 秒 | [玩游戏失败声音](https://www.aigei.com/sound/class/wan_you_xi_38/) | `/audio/music/aigei-game-defeat-1683890.mp3` |

用于核对原始文件的 SHA-256：

- 胜利：`AFD9105E37B20539D615F9CD47BD615F007BCB55BE2AC404A42DA972989620AA`
- 失败：`3FA38C733714BAD345989CA2BE27C96578EBEF18EA75CD2FCAEB314585DD411C`

## 背景音乐

下列四首音乐均由其 OpenGameArt 素材页面标为
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)。CC0
不要求署名，但这里保留作者、来源和许可信息，便于玩家查看曲名并追溯素材。

| 曲名 | 场景 | 作者 | OpenGameArt 源页面 | 许可 | 浏览器资源路径 |
| --- | --- | --- | --- | --- | --- |
| Wintery loop | 大厅 | Emma_MA | [Wintery loop](https://opengameart.org/content/wintery-loop) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `/audio/music/wintery-loop.mp3` |
| Winter Wind | 大厅 | wipics | [Winter Wind](https://opengameart.org/content/winter-wind) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `/audio/music/winter-wind.mp3` |
| Happy synths loop with slight christmas feeling | 大厅（默认） | 3xBlast | [Happy synths loop with slight christmas feeling](https://opengameart.org/content/happy-synths-loop-with-slight-christmas-feeling) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `/audio/music/happy-synths.mp3` |
| Black Diamond | 战斗（默认） | Joth | [Black Diamond](https://opengameart.org/content/black-diamond) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `/audio/music/black-diamond.mp3` |

音乐文件只做本地格式与码率转换，不改变原作品的 CC0 许可状态。虽然 CC0
允许商用且无需征得许可，素材页面和 Creative Commons 也不为权利状态提供
担保；发布时应保留本清单与原始下载记录作为素材来源凭据。
