import assert from "node:assert/strict";
import test from "node:test";
import { resolveUiLanguage } from "../app/language.ts";

test("browser language detection selects Chinese only for Chinese language tags", () => {
  assert.equal(resolveUiLanguage(null, "zh-CN,zh;q=0.9"), "zh");
  assert.equal(resolveUiLanguage(null, "zh-TW"), "zh");
  assert.equal(resolveUiLanguage(null, "ZH-Hans"), "zh");
  assert.equal(resolveUiLanguage(null, "en-US,en;q=0.9"), "en");
  assert.equal(resolveUiLanguage(null, "ja-JP"), "en");
  assert.equal(resolveUiLanguage(null, null), "en");
});

test("a valid manual language cookie overrides the browser default", () => {
  assert.equal(resolveUiLanguage("en", "zh-CN"), "en");
  assert.equal(resolveUiLanguage("zh", "en-US"), "zh");
  assert.equal(resolveUiLanguage("invalid", "zh-CN"), "zh");
});
