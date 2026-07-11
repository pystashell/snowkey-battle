"use client";

import { useMemo, useState } from "react";
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

const AI_LABELS: Record<AiLevel, string> = {
  rookie: "新手 AI",
  steady: "熟练 AI",
  expert: "高手 AI",
};

const SNOW_LABELS: Record<SnowfallLevel, string> = {
  light: "舒缓",
  classic: "标准",
  blizzard: "暴雪",
};

function OnlineSeat({
  player,
  selfPlayerId,
  isHost,
  teamSize,
  connected,
  sendCommand,
}: {
  player: RoomPlayer;
  selfPlayerId: string | null;
  isHost: boolean;
  teamSize: number;
  connected: boolean;
  sendCommand: (command: RoomCommand) => void;
}) {
  const isSelf = player.id === selfPlayerId;
  const controller = player.controller;
  const canMove = isHost || isSelf;
  return (
    <div className={`online-seat online-seat--${player.team}${isSelf ? " is-self" : ""}`}>
      <span className="online-seat__rank">{player.position === 0 ? "盾" : player.position + 1}</span>
      <span className="online-seat__identity">
        <strong>{player.name}{isSelf ? "（你）" : ""}</strong>
        <small>
          {player.role === "tank" ? "肉盾" : player.role === "striker" ? "快手" : "均衡"}
          {" · "}{player.maxHealth} HP
        </small>
      </span>
      <span className="online-seat__status">
        {controller.kind === "human" ? (
          <em className={controller.connected ? "is-online" : "is-away"}>
            {controller.isHost ? "房主 · " : ""}
            {!controller.connected ? "重连中" : controller.ready ? "已准备" : "未准备"}
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
            aria-label={`${player.name} AI 强度`}
          >
            {(Object.keys(AI_LABELS) as AiLevel[]).map((level) => (
              <option key={level} value={level}>{AI_LABELS[level]}</option>
            ))}
          </select>
        )}
        {canMove && (
          <span className="online-seat__moves">
            <button
              disabled={!connected || player.position === 0}
              onClick={() => sendCommand({ op: "lobby.move", playerId: player.id, direction: -1 })}
              aria-label={`${player.name} 前移`}
            >前</button>
            <button
              disabled={!connected || player.position === teamSize - 1}
              onClick={() => sendCommand({ op: "lobby.move", playerId: player.id, direction: 1 })}
              aria-label={`${player.name} 后移`}
            >后</button>
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
  const [copied, setCopied] = useState(false);
  const self = snapshot?.players.find((player) => player.id === snapshot.selfPlayerId) ?? null;
  const isHost = Boolean(snapshot && snapshot.selfPlayerId === snapshot.hostPlayerId);
  const connected = status === "connected";
  const busy = status === "creating" || status === "connecting" || status === "reconnecting";
  const hasPlayerName = playerName.trim().length > 0;
  const allHumansReady = snapshot?.players
    .filter((player) => player.controller.kind === "human")
    .every((player) => player.controller.kind === "human" && player.controller.connected && player.controller.ready) ?? false;
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
      window.prompt("复制这个邀请链接", url.toString());
    }
  };

  return (
    <section className="lobby lobby--online" aria-labelledby="online-game-title">
      <div className="lobby__story">
        <div className="mode-switch" role="group" aria-label="游戏模式">
          <button onClick={onLocalMode}>本机 AI</button>
          <button className="is-active">好友联机</button>
        </div>
        <p className="eyebrow"><span /> LIVE ROOM · SERVER AUTHORITATIVE</p>
        <h1 id="online-game-title">输入房间码，<br /><em>隔着网络开战！</em></h1>
        <p className="lobby__lead">
          最多 8 人。服务器统一生成雪花、裁定谁先打完并同步前排血量，断线后会自动回到原席位。
        </p>

        {!snapshot ? (
          <>
            <div className="online-entry">
              <label>
                <span>你的联机昵称（每人单独填写）</span>
                <input
                  value={playerName}
                  maxLength={8}
                  placeholder="请输入你的名字"
                  required
                  onChange={(event) => setPlayerName(event.target.value)}
                  aria-label="联机玩家名字"
                />
              </label>
              <button className="online-create" disabled={busy || !hasPlayerName} onClick={onCreate}>
                创建新房间
              </button>
              <div className="online-entry__divider"><span>或者加入好友</span></div>
              <label>
                <span>6 位房间码</span>
                <input
                  className="room-code-input"
                  value={roomCode}
                  maxLength={6}
                  onChange={(event) => setRoomCode(sanitizeRoomCode(event.target.value))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && roomCode.length === 6) onJoin();
                  }}
                  placeholder="例如 7KPM4X"
                  aria-label="输入房间码"
                />
              </label>
              <button disabled={roomCode.length !== 6 || busy || !hasPlayerName} onClick={onJoin}>
                加入房间
              </button>
            </div>
            <p className="online-connection-note">
              {status === "connecting" ? "正在连接房间服务器…" : error ?? "每位真人先填写自己的昵称；好友不需要 VPN，只要能打开最终部署地址即可。"}
            </p>
          </>
        ) : (
          <>
            <div className="room-code-banner">
              <span>房间码</span>
              <strong>{snapshot.code}</strong>
              <button onClick={copyInvite}>{copied ? "已复制" : "复制邀请链接"}</button>
            </div>

            <div className="online-room-controls">
              <label>
                <span>雪松队</span>
                <select
                  value={snapshot.config.pineSize}
                  disabled={!isHost || !connected}
                  onChange={(event) => sendCommand({ op: "lobby.set_config", config: { pineSize: Number(event.target.value) } })}
                  aria-label="联机雪松队人数"
                >
                  {[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count} 人</option>)}
                </select>
              </label>
              <label>
                <span>红莓队</span>
                <select
                  value={snapshot.config.berrySize}
                  disabled={!isHost || !connected}
                  onChange={(event) => sendCommand({ op: "lobby.set_config", config: { berrySize: Number(event.target.value) } })}
                  aria-label="联机红莓队人数"
                >
                  {[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count} 人</option>)}
                </select>
              </label>
              <label className="online-room-control--wide">
                <span>单词册</span>
                <select
                  value={snapshot.config.wordbookId}
                  disabled={!isHost || !connected}
                  onChange={(event) => sendCommand({ op: "lobby.set_config", config: { wordbookId: event.target.value as WordbookId } })}
                  aria-label="联机单词册"
                >
                  {WORD_BOOK_OPTIONS.map((book) => <option key={book.id} value={book.id}>{book.label}</option>)}
                </select>
              </label>
              <label>
                <span>雪量</span>
                <select
                  value={snapshot.config.snowfallLevel}
                  disabled={!isHost || !connected}
                  onChange={(event) => sendCommand({ op: "lobby.set_config", config: { snowfallLevel: event.target.value as SnowfallLevel } })}
                  aria-label="联机雪花密度"
                >
                  {(Object.keys(SNOW_LABELS) as SnowfallLevel[]).map((level) => (
                    <option key={level} value={level}>{SNOW_LABELS[level]}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="online-ready-row">
              <span>{snapshot.humanCount}/8 位真人 · {status === "reconnecting" ? "正在重连" : "实时连接正常"}</span>
              <button disabled={!connected} onClick={() => sendCommand({ op: "lobby.set_team", team: self?.team === "pine" ? "berry" : "pine" })}>
                换到{self?.team === "pine" ? "红莓队" : "雪松队"}
              </button>
              <button
                className={self?.controller.kind === "human" && self.controller.ready ? "is-ready" : ""}
                disabled={!connected}
                onClick={() => sendCommand({
                  op: "presence.ready",
                  ready: !(self?.controller.kind === "human" && self.controller.ready),
                })}
              >
                {self?.controller.kind === "human" && self.controller.ready ? "取消准备" : "我准备好了"}
              </button>
            </div>

            {isHost && (
              <button
                className="primary-button online-start"
                disabled={!allHumansReady || !connected}
                onClick={() => sendCommand({ op: "match.start" })}
              >
                <span>{snapshot.config.pineSize} VS {snapshot.config.berrySize} · {allHumansReady ? "全员已准备" : "等待准备"}</span>
                <strong>房主开始对战 →</strong>
              </button>
            )}
            {!isHost && <p className="local-note">准备后等待房主开始 · 房主配置会实时同步</p>}
            <button className="online-leave" onClick={onLeave}>离开房间</button>
            {error && <p className="online-error">{error}</p>}
          </>
        )}
      </div>

      <div className="lobby__room">
        {!snapshot ? (
          <div className="room-card online-explainer">
            <strong>远程联机如何工作</strong>
            <ol>
              <li><b>1</b><span>创建房间并复制邀请链接</span></li>
              <li><b>2</b><span>好友输入 6 位码加入，两队可不对称</span></li>
              <li><b>3</b><span>大家打同一批词，最快者抢到雪球</span></li>
              <li><b>✦</b><span>发光长难词是冰晶雪球：15 伤害并冻结前排 1 秒</span></li>
            </ol>
            <small>浏览器切后台不会暂停整间房；重新打开会自动尝试恢复席位。</small>
          </div>
        ) : (
          <div className="room-card room-card--formation online-room-card">
            <div className="room-card__top">
              <span><i /> {connected ? "房间在线" : "连接中"}</span>
              <strong>{snapshot.config.pineSize} VS {snapshot.config.berrySize}</strong>
              <small>{snapshot.humanCount} 位真人，空位由 AI 补齐</small>
            </div>
            <div className="room-vs">
              <section>
                <header><span className="team-mark team-mark--pine" /> 雪松队 <b>{grouped.pine.length}/4</b></header>
                {grouped.pine.map((player) => (
                  <OnlineSeat
                    key={player.id}
                    player={player}
                    selfPlayerId={snapshot.selfPlayerId}
                    isHost={isHost}
                    teamSize={snapshot.config.pineSize}
                    connected={connected}
                    sendCommand={sendCommand}
                  />
                ))}
              </section>
              <div className="room-vs__river"><span>VS</span></div>
              <section>
                <header><span className="team-mark team-mark--berry" /> 红莓队 <b>{grouped.berry.length}/4</b></header>
                {grouped.berry.map((player) => (
                  <OnlineSeat
                    key={player.id}
                    player={player}
                    selfPlayerId={snapshot.selfPlayerId}
                    isHost={isHost}
                    teamSize={snapshot.config.berrySize}
                    connected={connected}
                    sendCommand={sendCommand}
                  />
                ))}
              </section>
            </div>
            <div className="room-card__footer">
              <span>🔒 服务端裁判</span>
              <span>↻ 断线重连</span>
              <span>⚙ 职业管血量，难度管 AI 速度</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
