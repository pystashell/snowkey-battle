import type { Metadata } from "next";
import Link from "next/link";
import { getRequestLanguage } from "../server-language";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How SnowKey Battle handles local preferences and temporary online room data.",
};

export default async function PrivacyPage() {
  const language = await getRequestLanguage();
  const zh = language === "zh";

  return (
    <main className="privacy-page">
      <article className="privacy-card">
        <Link className="privacy-back" href="/">
          {zh ? "← 返回游戏" : "← Back to the game"}
        </Link>
        <p className="privacy-eyebrow">SNOWKEY BATTLE · v1.0.0</p>
        <h1>{zh ? "隐私说明" : "Privacy Notice"}</h1>
        <p className="privacy-updated">
          {zh ? "生效日期：2026 年 7 月 29 日" : "Effective July 29, 2026"}
        </p>

        <section>
          <h2>{zh ? "简要说明" : "In short"}</h2>
          <p>
            {zh
              ? "SnowKey Battle 不要求注册账号，不接入广告或第三方行为分析。请在联机时使用昵称，不要填写真实姓名、邮箱或其他个人资料。"
              : "SnowKey Battle requires no account and includes no ads or third-party behavioral analytics. Use a nickname in online rooms and do not enter your real name, email address, or other personal details."}
          </p>
        </section>

        <section>
          <h2>{zh ? "保存在你设备上的内容" : "Data kept on your device"}</h2>
          <p>
            {zh
              ? "浏览器会保存界面语言、键盘模式、音乐与音效设置，以及用于断线重连的随机房间凭据。这些设置可通过清除本站浏览器数据移除。"
              : "Your browser stores interface language, keyboard mode, music and sound settings, plus random room credentials used for reconnecting after a disconnect. You can remove them by clearing this site's browser data."}
          </p>
        </section>

        <section>
          <h2>{zh ? "联机房间数据" : "Online room data"}</h2>
          <p>
            {zh
              ? "创建或加入房间时，昵称、房间操作、打字指令、比赛状态和随机重连凭据会发送到 Cloudflare 上的权威房间服务。掉线席位保留 60 秒；最后一位真人离开后房间会回收，6 小时无活动回收作为兜底。"
              : "When you create or join a room, your nickname, room actions, typing commands, match state, and random reconnect credential are sent to the authoritative room service on Cloudflare. A disconnected seat is held for 60 seconds; rooms are retired after the last human leaves, with a six-hour idle fallback."}
          </p>
          <p>
            {zh
              ? "Cloudflare 作为托管和网络服务商会处理请求所需的网络与运行日志。游戏代码不会把房间数据出售或用于广告画像。"
              : "Cloudflare, as the hosting and network provider, processes the network and operational logs needed to run the service. The game does not sell room data or use it for advertising profiles."}
          </p>
        </section>

        <section>
          <h2>{zh ? "音频、开源与联系" : "Audio, source, and contact"}</h2>
          <p>
            {zh
              ? "音频来源与许可单独列明。项目源代码公开可读，但仓库没有项目级开源许可证；第三方词库和音频仅适用各自的许可或来源条款。"
              : "Audio sources and licenses are documented separately. The source code is publicly readable, but the repository has no project-wide open-source license; third-party word data and audio remain subject to their own licenses or source terms."}
          </p>
          <div className="privacy-links">
            <a href="/audio/AUDIO_LICENSES.md">{zh ? "音频许可" : "Audio licenses"}</a>
            <a href="https://github.com/pystashell/snowkey-battle" target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a href="https://github.com/pystashell/snowkey-battle/issues" target="_blank" rel="noreferrer">
              {zh ? "问题与联系" : "Questions and contact"}
            </a>
          </div>
        </section>
      </article>
    </main>
  );
}
