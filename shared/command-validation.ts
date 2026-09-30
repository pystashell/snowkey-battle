import { GAME_PROTOCOL_VERSION, type CommandMessage, type RoomCommand } from "./game-protocol.ts";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function playerId(value: unknown) {
  return typeof value === "string" && /^(pine|berry)-[0-3]$/.test(value);
}

function member(value: unknown, values: readonly string[]) {
  return typeof value === "string" && values.includes(value);
}

export function isRoomCommand(value: unknown): value is RoomCommand {
  if (!record(value)) return false;
  switch (value.op) {
    case "presence.ready": return typeof value.ready === "boolean";
    case "lobby.set_team": return value.team === "pine" || value.team === "berry";
    case "lobby.move": return playerId(value.playerId) && (value.direction === -1 || value.direction === 1);
    case "lobby.set_ai_level": return playerId(value.playerId) && member(value.level, ["rookie", "steady", "expert"]);
    case "lobby.remove_ai":
    case "lobby.remove_player": return playerId(value.playerId);
    case "lobby.set_config": {
      if (!record(value.config)) return false;
      return Object.entries(value.config).every(([key, setting]) => {
        switch (key) {
          case "pineSize":
          case "berrySize": return typeof setting === "number" && Number.isInteger(setting) && setting >= 1 && setting <= 4;
          case "wordbookId": return member(setting, ["winter", "cet4", "cet6", "postgraduate", "toefl", "sat", "mixed"]);
          case "snowfallLevel": return member(setting, ["light", "classic", "blizzard"]);
          default: return false;
        }
      });
    }
    case "type.key": return typeof value.key === "string" && /^[a-z]$/i.test(value.key);
    case "presence.leave":
    case "match.start":
    case "match.restart":
    case "type.cancel":
    case "sync.request":
    case "ping": return true;
    default: return false;
  }
}

export function isCommandMessage(value: unknown): value is CommandMessage {
  return record(value)
    && value.v === GAME_PROTOCOL_VERSION && value.type === "command"
    && typeof value.id === "string" && value.id.length > 0 && value.id.length <= 128
    && typeof value.sequence === "number" && Number.isSafeInteger(value.sequence) && value.sequence >= 0
    && isRoomCommand(value.command);
}
