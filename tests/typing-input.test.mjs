import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

// Install the DOM before React DOM chooses its input event implementation.
const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost/" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createElement, act, useState } = await import("react");
const { createRoot } = await import("react-dom/client");
const { EnglishTypingInput } = await import("../app/EnglishTypingInput.tsx");

async function mount(t) {
  const changes = [];
  let clears = 0;
  function Harness() {
    const [value, setValue] = useState("");
    return createElement(EnglishTypingInput, { value, clearOnBackspace: true,
      onValueChange: (next) => { changes.push(next); setValue(next); },
      onClear: () => { clears++; setValue(""); },
    });
  }
  const root = createRoot(document.getElementById("root"));
  await act(() => root.render(createElement(Harness)));
  t.after(async () => { await act(() => root.unmount()); });
  const input = document.querySelector("input");
  const event = async (type, init = {}) => act(() => {
    const Constructor = type.startsWith("composition") ? window.CompositionEvent : window.KeyboardEvent;
    input.dispatchEvent(new Constructor(type, { bubbles: true, cancelable: true, ...init }));
  });
  const text = async (value, init = {}) => act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, value);
    input.dispatchEvent(new window.InputEvent("input", { bubbles: true, data: value, inputType: "insertText", ...init }));
  });
  return { changes, input, event, text, get clears() { return clears; } };
}

test("mobile text input without a letter keydown is accepted", async (t) => {
  const input = await mount(t);
  await input.event("keydown", { key: "Unidentified", keyCode: 229 });
  await input.text("s");
  assert.deepEqual(input.changes, ["s"]);
});

test("physical keyboard produces one input, not both keydown and text", async (t) => {
  const input = await mount(t);
  await input.event("keydown", { key: "s" });
  assert.deepEqual(input.changes, []);
  await input.text("s");
  assert.deepEqual(input.changes, ["s"]);
  await input.event("keydown", { key: "Backspace" });
  assert.equal(input.clears, 1);
});

test("IME composition only commits once and ignores cancel keys while composing", async (t) => {
  const input = await mount(t);
  await input.event("compositionstart");
  await input.text("sn", { isComposing: true });
  await input.event("keydown", { key: " ", isComposing: true });
  await input.text("snow", { isComposing: true });
  assert.equal(input.clears, 0);
  assert.deepEqual(input.changes, []);
  await input.event("compositionend", { data: "snow" });
  await input.text("snow");
  assert.deepEqual(input.changes, ["snow"]);
  await input.event("keydown", { key: "Escape" });
  assert.equal(input.clears, 1);
});
