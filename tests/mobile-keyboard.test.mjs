import assert from "node:assert/strict";
import test from "node:test";

import {
  COMPACT_KEYBOARD_LAYOUT,
  MOBILE_KEYBOARD_MEDIA_QUERY,
  MOBILE_KEYBOARD_STORAGE_KEY,
  resolveMobileKeyboardMode,
} from "../app/mobile-keyboard.ts";

test("a new mobile visitor defaults to the compact keyboard", () => {
  assert.equal(resolveMobileKeyboardMode(null, true), "compact");
  assert.equal(resolveMobileKeyboardMode("invalid", true), "compact");
});

test("a new desktop visitor defaults to the system keyboard", () => {
  assert.equal(resolveMobileKeyboardMode(null, false), "system");
  assert.equal(resolveMobileKeyboardMode("invalid", false), "system");
});

test("an explicit keyboard choice wins over the device default", () => {
  assert.equal(resolveMobileKeyboardMode("system", true), "system");
  assert.equal(resolveMobileKeyboardMode("compact", false), "compact");
});

test("the preference key and mobile breakpoint remain stable", () => {
  assert.equal(MOBILE_KEYBOARD_STORAGE_KEY, "snowkey-battle:mobile-keyboard");
  assert.match(MOBILE_KEYBOARD_MEDIA_QUERY, /max-width: 560px/);
});

test("the compact keys follow the standard three-row QWERTY order", () => {
  assert.deepEqual(
    COMPACT_KEYBOARD_LAYOUT.map((row) => row.letters.join("")),
    ["qwertyuiop", "asdfghjkl", "zxcvbnm"],
  );
});

test("the bottom letter row is centered between iPhone-style edge keys", () => {
  assert.equal(COMPACT_KEYBOARD_LAYOUT[2].leadingKey, "shift");
  assert.equal(COMPACT_KEYBOARD_LAYOUT[2].trailingKey, "clear");
  assert.equal(COMPACT_KEYBOARD_LAYOUT[0].leadingKey, undefined);
  assert.equal(COMPACT_KEYBOARD_LAYOUT[1].trailingKey, undefined);
});
