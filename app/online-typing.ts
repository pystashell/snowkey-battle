import type { RoomSnapshot } from "../shared/game-protocol";

type Command = { id: string; sequence: number; ackRevision?: number };

/** Predictions are presentation-only; room snapshots determine every outcome. */
export class OnlineTyping {
  readonly pending = new Map<number, Command>();
  readonly claims = new Map<number, Command>();

  track(command: Command, wordId?: number) {
    this.pending.set(command.sequence, command);
    if (wordId !== undefined) this.claims.set(wordId, command);
  }

  acknowledge(sequence: number, revision: number) {
    for (const command of this.pending.values()) {
      if (command.sequence <= sequence) command.ackRevision ??= revision;
    }
  }

  reject(id: string) {
    for (const [sequence, command] of this.pending) if (command.id === id) this.pending.delete(sequence);
    for (const [wordId, command] of this.claims) if (command.id === id) this.claims.delete(wordId);
  }

  reconcile(snapshot: RoomSnapshot) {
    const processed = (command: Command) => snapshot.lastProcessedSequence !== undefined
      ? command.sequence <= snapshot.lastProcessedSequence
      : command.ackRevision !== undefined && command.ackRevision <= snapshot.revision;
    for (const [sequence, command] of this.pending) if (processed(command)) this.pending.delete(sequence);
    const wordIds = new Set(snapshot.words.map((word) => word.id));
    for (const [wordId, command] of this.claims) {
      if (!wordIds.has(wordId) || processed(command)) this.claims.delete(wordId);
    }
    if (snapshot.phase !== "playing") this.clear();
  }

  clear() {
    this.pending.clear();
    this.claims.clear();
  }
}
