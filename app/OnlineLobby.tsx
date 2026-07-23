"use client";

import { useMemo, useState } from "react";
import { useLanguage } from "./LanguageContext";
import { WORD_BOOK_OPTIONS } from "./wordbooks";
import type { RoomConnectionStatus } from "./useRoomSocket";
import type {
  AiLevel,
  RoomCommand,
  RoomPlayer,
  RoomSnapshot,
  SnowfallLevel,
  WordbookId,
} from "../shared/game-protocol";
import { sanitizeRoomCode } from "../shared/game-protocol";

type OnlineLobbyProps = {
  playerName: string;
  setPlayerName: (name: string) => void;
  roomCode: string;
  setRoomCode: (code: string) => void;
  status: RoomConnectionStatus;
  error: string | null;
  snapshot: RoomSnapshot | null;
  onCreate: () => void;
  onJoin: () => void;
  onLeave: () => void;
  onLocalMode: () => void;
  sendCommand: (command: RoomCommand) => void;
};

const AI_LABELS: Record<AiLevel, { zh: string; en: string }> = {
  rookie: { zh: "新手 AI", en: "Rookie AI" },
  steady: { zh: "熟练 AI", en: "Skilled AI" },
  expert: { zh: "高手 AI", en: "Expert AI" },
};

const SNOW_LABELS: Record<SnowfallLevel, { zh: string; en: string }> = {
  light: { zh: "舒缓", en: "Light" },
  classic: { zh: "标准", en: "Classic" },
  blizzard: { zh: "暴雪", en: "Blizzard" },
};

const ENGLISH_AI_NAMES: Record<string, string> = {
  "pine-0": "Snowball",
  "pine-1": "Cheng",
  "pine-2": "Ricecake",
  "pine-3": "Bei",
  "berry-0": "Dumpling",
  "berry-1": "Pomelo",
  "berry-2": "Man",
  "berry-3": "Star",
};

function OnlineSeat({
  player,
  selfPlayerId,
  isHost,
  teamSize,
  connected,
  onLeave,
  sendCommand,
}: {
  player: RoomPlayer;
  selfPlayerId: string | null;
  isHost: boolean;
  teamSize: number;
  connected: boolean;
  onLeave: () => void;
  sendCommand: (command: RoomCommand) => void;
}) {
  const { language, text } = useLanguage();
  const isSelf = player.id === selfPlayerId;
  const controller = player.controller;
  const playerDisplayName = language === "en" && controller.kind === "ai"
    ? ENGLISH_AI_NAMES[player.id] ?? player.name
    : player.name;
  const canMove = isHost || isSelf;
  const showRemove = isHost;
  const canRemove = connected && (isSelf || controller.kind === "human" || teamSize > 1);
  const removeTitle = isSelf
    ? text("离开房间", "Leave room")
    : controller.kind === "human"
    ? text("移除玩家", "Remove player")
    : teamSize > 1
      ? text("移除 AI", "Remove AI")
      : text("每队至少保留一名队员", "Each team needs at least one player");
  return (
    <div className={`online-seat online-seat--${player.team}${isSelf ? " is-self" : ""}${showRemove ? " has-remove-control" : ""}`}>
      {showRemove && (
        <button
          className="online-seat__remove"
          type="button"
          disabled={!canRemove}
          onClick={() => {
            if (isSelf) onLeave();
            else sendCommand(controller.kind === "ai"
              ? { op: "lobby.remove_ai", playerId: player.id }
              : { op: "lobby.remove_player", playerId: player.id });
          }}
          title={removeTitle}
          aria-label={isSelf
            ? text("离开房间", "Leave room")
            : text(`移除 ${player.name}`, `Remove ${playerDisplayName}`)}
        >−</button>
      )}
      <span className="online-seat__rank">{player.position === 0 ? text("前", "F") : player.position + 1}</span>
      <span className="online-seat__identity">
        <strong>{playerDisplayName}{isSelf ? text("（你）", " (You)") : ""}</strong>
        <small>{player.position === 0
          ? text("前排", "Frontline")
          : text(`第 ${player.position + 1} 位`, `Position ${player.position + 1}`)} · {player.maxHealth} HP</small>
      </span>
      <span className="online-seat__status">
        {controller.kind === "human" ? (
          <em className={controller.connected ? "is-online" : "is-away"}>
            {controller.isHost ? text("房主 · ", "Host · ") : ""}
            {!controller.connected
              ? text("重连中", "Reconnecting")
              : controller.ready
                ? text("已准备", "Ready")
                : text("未准备", "Not ready")}
          </em>
        ) : (
          <select
            value={controller.level}
            disabled={!isHost || !connected}
            onChange={(event) => sendCommand({
              op: "lobby.set_ai_level",
              playerId: player.id,
              level: event.target.value as AiLevel,
            })}
            aria-label={text(`${player.name} AI 强度`, `${playerDisplayName} AI difficulty`)}
          >
            {(Object.keys(AI_LABELS) as AiLevel[]).map((level) => (
              <option key={level} value={level}>{text(AI_LABELS[level].zh, AI_LABELS[level].en)}</option>
            ))}
          </select>
        )}
        {canMove && (
          <span className="online-seat__moves">
            <button
              disabled={!connected || player.position === 0}
              onClick={() => sendCommand({ op: "lobby.move", playerId: player.id, direction: -1 })}
              aria-label={text(`${player.name} 前移`, `Move ${playerDisplayName} forward`)}
            >{text("前", "Forward")}</button>
            <button
              disabled={!connected || player.position === teamSize - 1}
              onClick={() => sendCommand({ op: "lobby.move", playerId: player.id, direction: 1 })}
              aria-label={text(`${player.name} 后移`, `Move ${playerDisplayName} back`)}
            >{text("后", "Back")}</button>
          </span>
        )}
      </span>
    </div>
  );
}

export function OnlineLobby(props: OnlineLobbyProps) {
  const {
    playerName,
    setPlayerName,
    roomCode,
    setRoomCode,
    status,
    error,
    snapshot,
    onCreate,
    onJoin,
    onLeave,
    onLocalMode,
    sendCommand,
  } = props;
  const { language, text } = useLanguage();
  const [copied, setCopied] = useState(false);
  const self = snapshot?.players.find((player) => player.id === snapshot.selfPlayerId) ?? null;
  const isHost = Boolean(snapshot && snapshot.selfPlayerId === snapshot.hostPlayerId);
  const connected = status === "connected";
  const busy = status === "creating" || status === "connecting" || status === "reconnecting";
  const hasPlayerName = playerName.trim().length > 0;
  const canCreate = hasPlayerName && !busy;
  const canJoin = canCreate && roomCode.length === 6;
  const humanGuests = snapshot?.players
    .filter((player) => player.controller.kind === "human" && !player.controller.isHost) ?? [];
  const allHumanGuestsReady = humanGuests
    .every((player) => player.controller.kind === "human" && player.controller.connected && player.controller.ready);
  const hasHumanGuests = humanGuests.length > 0;
  const grouped = useMemo(() => ({
    pine: snapshot?.players.filter((player) => player.team === "pine").sort((a, b) => a.position - b.position) ?? [],
    berry: snapshot?.players.filter((player) => player.team === "berry").sort((a, b) => a.position - b.position) ?? [],
  }), [snapshot]);

  const copyInvite = async () => {
    if (!snapshot || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("room", snapshot.code);
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      window.prompt(text("复制这个邀请链接", "Copy this invitation link"), url.toString());
    }
  };

  return (
    <section className="lobby lobby--online" aria-labelledby="online-game-title">
      <div className="lobby__story">
        <div className="mode-switch" role="group" aria-label={text("游戏模式", "Game mode")}>
          <button onClick={onLocalMode}>{text("本机 AI", "Local AI")}</button>
          <button className="is-active">{text("好友联机", "Online with Friends")}</button>
        </div>
        <p className="eyebrow"><span /> LIVE ROOM · SERVER AUTHORITATIVE</p>
        <h1 id="online-game-title">
          {text("创建或加入房间，", "Create or join a room,")}<br />
          <em>{text("隔着网络开战！", "then battle online!")}</em>
        </h1>
        <p className="lobby__lead">
          {text(
            "最多 8 人。服务器统一生成雪花、裁定谁先打完并同步前排血量，断线后会自动回到原席位。",
            "Up to 8 players. The server creates every word, decides who finishes first, synchronizes health, and restores your seat after a disconnect.",
          )}
        </p>

        {!snapshot ? (
          <>
            <div className="online-entry">
              <label className="online-entry__name">
                <span>{text("你的名字（必填，创建或加入房间都需要）", "Your name (required to create or join)")}</span>
                <input
                  value={playerName}
                  maxLength={8}
                  placeholder={text("请输入你的名字", "Enter your name")}
                  required
                  onChange={(event) => setPlayerName(event.target.value)}
                  aria-label={text("联机玩家名字", "Online player name")}
                />
              </label>
              <div className="online-entry__actions" role="group" aria-label={text("房间操作", "Room actions")}>
                <button className="online-create" disabled={!canCreate} onClick={onCreate}>
                  {text("＋ 创建新房间", "+ Create New Room")}
                </button>
                <div className="online-join">
                  <label>
                    <span>{text("好友的 6 位房间码", "Friend's 6-character room code")}</span>
                    <input
                      className="room-code-input"
                      value={roomCode}
                      maxLength={6}
                      onChange={(event) => setRoomCode(sanitizeRoomCode(event.target.value))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && canJoin) onJoin();
                      }}
                      placeholder={text("例如 7KPM4X", "e.g. 7KPM4X")}
                      aria-label={text("输入房间码", "Enter room code")}
                    />
                  </label>
                  <button disabled={!canJoin} onClick={onJoin}>
                    {text("→ 加入房间", "→ Join Room")}
                  </button>
                </div>
              </div>
            </div>
            <p className="online-connection-note">
              {status === "connecting"
                ? text("正在连接房间服务器…", "Connecting to the room server…")
                : error ?? text(
                  "每位真人先填写自己的昵称；好友不需要 VPN，只要能打开最终部署地址即可。",
                  "Every player enters their own name. Friends only need the public game link; no VPN is required.",
                )}
            </p>
          </>
        ) : (
          <>
            <div className="room-code-banner">
              <span>{text("房间码", "Room code")}</span>
              <strong>{snapshot.code}</strong>
              <button onClick={copyInvite}>{copied
                ? text("已复制", "Copied")
                : text("复制邀请链接", "Copy Invite Link")}</button>
            </div>

            <div className="online-room-controls">
              <label>
                <span>{text("雪松队", "Pine Team")}</span>
                <select
                  value={snapshot.config.pineSize}
                  disabled={!isHost || !connected}
                  onChange={(event) => sendCommand({ op: "lobby.set_config", config: { pineSize: Number(event.target.value) } })}
                  aria-label={text("联机雪松队人数", "Online Pine team size")}
                >
                  {[1, 2, 3, 4].map((count) => <option key={count} value={count}>{text(`${count} 人`, `${count} ${count === 1 ? "player" : "players"}`)}</option>)}
                </select>
              </label>
              <label>
                <span>{text("红莓队", "Berry Team")}</span>
                <select
                  value={snapshot.config.berrySize}
                  disabled={!isHost || !connected}
                  onChange={(event) => sendCommand({ op: "lobby.set_config", config: { berrySize: Number(event.target.value) } })}
                  aria-label={text("联机红莓队人数", "Online Berry team size")}
                >
                  {[1, 2, 3, 4].map((count) => <option key={count} value={count}>{text(`${count} 人`, `${count} ${count === 1 ? "player" : "players"}`)}</option>)}
                </select>
              </label>
              <label className="online-room-control--wide">
                <span>{text("单词册", "Wordbook")}</span>
                <select
                  value={snapshot.config.wordbookId}
                  disabled={!isHost || !connected}
                  onChange={(event) => sendCommand({ op: "lobby.set_config", config: { wordbookId: event.target.value as WordbookId } })}
                  aria-label={text("联机单词册", "Online wordbook")}
                >
                  {WORD_BOOK_OPTIONS.map((book) => <option key={book.id} value={book.id}>{language === "zh" ? book.label : book.labelEn}</option>)}
                </select>
              </label>
              <label>
                <span>{text("雪量", "Snowfall")}</span>
                <select
                  value={snapshot.config.snowfallLevel}
                  disabled={!isHost || !connected}
                  onChange={(event) => sendCommand({ op: "lobby.set_config", config: { snowfallLevel: event.target.value as SnowfallLevel } })}
                  aria-label={text("联机雪花密度", "Online snowfall density")}
                >
                  {(Object.keys(SNOW_LABELS) as SnowfallLevel[]).map((level) => (
                    <option key={level} value={level}>{text(SNOW_LABELS[level].zh, SNOW_LABELS[level].en)}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="online-ready-row">
              <span>{text(
                `${snapshot.humanCount}/8 位真人 · ${status === "reconnecting" ? "正在重连" : "实时连接正常"}`,
                `${snapshot.humanCount}/8 human players · ${status === "reconnecting" ? "reconnecting" : "live connection healthy"}`,
              )}</span>
              <button disabled={!connected} onClick={() => sendCommand({ op: "lobby.set_team", team: self?.team === "pine" ? "berry" : "pine" })}>
                {text(
                  `换到${self?.team === "pine" ? "红莓队" : "雪松队"}`,
                  `Switch to ${self?.team === "pine" ? "Berry Team" : "Pine Team"}`,
                )}
              </button>
              <button
                className={self?.controller.kind === "human" && self.controller.ready ? "is-ready" : ""}
                disabled={!connected}
                onClick={() => sendCommand({
                  op: "presence.ready",
                  ready: !(self?.controller.kind === "human" && self.controller.ready),
                })}
              >
                {self?.controller.kind === "human" && self.controller.ready
                  ? text("取消准备", "Not Ready")
                  : text("我准备好了", "I'm Ready")}
              </button>
            </div>

            {isHost && (
              <button
                className="primary-button online-start"
                disabled={!allHumanGuestsReady || !connected}
                onClick={() => sendCommand({ op: "match.start" })}
              >
                <span>{snapshot.config.pineSize} VS {snapshot.config.berrySize} · {!hasHumanGuests
                  ? text("可立即开始", "Ready to Start")
                  : allHumanGuestsReady
                    ? text("全员已准备", "Everyone Ready")
                    : text("等待准备", "Waiting for Ready")}</span>
                <strong>{text("房主开始对战 →", "Host Starts Match →")}</strong>
              </button>
            )}
            {!isHost && <p className="local-note">{text(
              "准备后等待房主开始 · 房主配置会实时同步",
              "Ready up and wait for the host · Host settings sync live",
            )}</p>}
            <button className="online-leave" onClick={onLeave}>{text("离开房间", "Leave Room")}</button>
            {error && <p className="online-error">{error}</p>}
          </>
        )}
      </div>

      <div className="lobby__room">
        {!snapshot ? (
          <div className="room-card online-explainer">
            <strong>{text("远程联机如何工作", "How Online Rooms Work")}</strong>
            <ol>
              <li><b>1</b><span>{text("创建房间并复制邀请链接", "Create a room and copy its invite link")}</span></li>
              <li><b>2</b><span>{text("好友输入 6 位码加入，两队可不对称", "Friends join with the 6-character code; teams may be uneven")}</span></li>
              <li><b>3</b><span>{text("大家打同一批词，最快者抢到雪球", "Everyone types the same words; the fastest player claims each snowball")}</span></li>
              <li><b>✦</b><span>{text(
                "当前词册最长的 10 个单词会无放回轮换为超级雪花：命中对方全体 15 点并冻住 1 秒",
                "The 10 longest words in the selected book rotate without repeats as Super Snowflakes: hit every opponent for 15 and freeze them for 1 second",
              )}</span></li>
            </ol>
            <small>{text(
              "浏览器切后台不会暂停整间房；重新打开会自动尝试恢复席位。",
              "Switching tabs does not pause the room. Reopening the game automatically tries to restore your seat.",
            )}</small>
          </div>
        ) : (
          <div className="room-card room-card--formation online-room-card">
            <div className="room-card__top">
              <span><i /> {connected ? text("房间在线", "Room Online") : text("连接中", "Connecting")}</span>
              <strong>{snapshot.config.pineSize} VS {snapshot.config.berrySize}</strong>
              <small>{text(
                `${snapshot.humanCount} 位真人，空位由 AI 补齐`,
                `${snapshot.humanCount} ${snapshot.humanCount === 1 ? "human" : "humans"}; AI fills empty seats`,
              )}</small>
            </div>
            <div className="room-vs">
              <section>
                <header><span className="team-mark team-mark--pine" /> {text("雪松队", "Pine Team")} <b>{grouped.pine.length}/4</b></header>
                {grouped.pine.map((player) => (
                  <OnlineSeat
                    key={player.id}
                    player={player}
                    selfPlayerId={snapshot.selfPlayerId}
                    isHost={isHost}
                    teamSize={snapshot.config.pineSize}
                    connected={connected}
                    onLeave={onLeave}
                    sendCommand={sendCommand}
                  />
                ))}
              </section>
              <div className="room-vs__river"><span>VS</span></div>
              <section>
                <header><span className="team-mark team-mark--berry" /> {text("红莓队", "Berry Team")} <b>{grouped.berry.length}/4</b></header>
                {grouped.berry.map((player) => (
                  <OnlineSeat
                    key={player.id}
                    player={player}
                    selfPlayerId={snapshot.selfPlayerId}
                    isHost={isHost}
                    teamSize={snapshot.config.berrySize}
                    connected={connected}
                    onLeave={onLeave}
                    sendCommand={sendCommand}
                  />
                ))}
              </section>
            </div>
            <div className="room-card__footer">
              <span>{text("🔒 服务端裁判", "🔒 Server Referee")}</span>
              <span>{text("↻ 断线重连", "↻ Reconnect Support")}</span>
              <span>{text("⚙ 全员 100 HP，AI 难度只影响速度", "⚙ Everyone has 100 HP; AI difficulty only changes typing speed")}</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
