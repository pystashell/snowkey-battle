import assert from "node:assert/strict";
import test from "node:test";
import { OnlineTyping } from "../app/online-typing.ts";

test("a rejected predicted claim returns only after its command is processed", () => {
  const typing = new OnlineTyping();
  typing.track({ id: "final-snow", sequence: 20 }, 7);
  typing.track({ id: "final-star", sequence: 24 }, 8);
  const snapshot = { phase: "playing", revision: 30, words: [{ id: 7 }, { id: 8 }], lastProcessedSequence: 19 };
  typing.reconcile(snapshot);
  assert.equal(typing.claims.size, 2, "a delayed snapshot cannot restore pending claims");
  typing.reconcile({ ...snapshot, lastProcessedSequence: 20 });
  assert.equal(typing.claims.has(7), false, "frozen/rejected word becomes visible again");
  assert.equal(typing.claims.has(8), true, "later inputs remain predicted");
  assert.deepEqual([...typing.pending.keys()], [24]);
});

test("claims confirmed by removal and command errors are reconciled independently", () => {
  const typing = new OnlineTyping();
  typing.track({ id: "claim", sequence: 1 }, 7);
  typing.track({ id: "rejected", sequence: 2 }, 8);
  typing.reconcile({ phase: "playing", revision: 1, words: [{ id: 8 }], lastProcessedSequence: 1 });
  assert.equal(typing.claims.has(7), false);
  typing.reject("rejected");
  assert.equal(typing.claims.size, 0);
  assert.equal(typing.pending.size, 0);
});

test("legacy snapshot fallback waits for the acknowledged revision", () => {
  const typing = new OnlineTyping();
  typing.track({ id: "claim", sequence: 10 }, 7);
  typing.acknowledge(10, 4);
  typing.reconcile({ phase: "playing", revision: 3, words: [{ id: 7 }] });
  assert.equal(typing.claims.size, 1);
  typing.reconcile({ phase: "playing", revision: 4, words: [{ id: 7 }] });
  assert.equal(typing.claims.size, 0);
});
