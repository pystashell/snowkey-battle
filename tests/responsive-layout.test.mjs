import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("battle screens are constrained to the current visual viewport height", () => {
  assert.match(
    css,
    /\.game-shell--battle\s*\{[^}]*height:\s*var\(--game-visual-viewport-height,\s*100dvh\);[^}]*min-height:\s*var\(--game-visual-viewport-height,\s*100dvh\);[^}]*max-height:\s*var\(--game-visual-viewport-height,\s*100dvh\);[^}]*\}/s,
  );
});

test("the arena can shrink before the typing dock is pushed off-screen", () => {
  assert.match(
    css,
    /\.game-shell--battle \.match\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;[^}]*\}/s,
  );
  assert.match(
    css,
    /\.game-shell--battle \.arena\s*\{[^}]*min-height:\s*0;[^}]*\}/s,
  );
});

test("short desktop battles hide chrome in two height-driven stages", () => {
  assert.match(
    css,
    /@media \(hover:\s*hover\) and \(pointer:\s*fine\) and \(min-width:\s*821px\) and \(max-height:\s*800px\)\s*\{[\s\S]*?\.game-shell--battle > \.language-switcher,[\s\S]*?\.game-shell--battle > \.audio-controls,[\s\S]*?\.game-shell--battle \.match-header\s*\{[^}]*display:\s*none;[^}]*\}[\s\S]*?\}/,
  );
  assert.match(
    css,
    /@media \(hover:\s*hover\) and \(pointer:\s*fine\) and \(min-width:\s*821px\) and \(max-height:\s*640px\)\s*\{[\s\S]*?\.game-shell--battle \.scoreboard\s*\{[^}]*display:\s*none;[^}]*\}[\s\S]*?\}/,
  );
});
