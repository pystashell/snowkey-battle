import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the snow fighting game", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>河岸雪仗/);
  assert.match(html, /SNOWCRAFT-INSPIRED TACTICAL REMAKE/);
  assert.match(html, /全英文单词竞速/);
  assert.match(html, /按阵型开战/);
  assert.match(html, /3(?:<!-- -->)? VS (?:<!-- -->)?3/);
  assert.match(html, /1 位真人 \+ (?:<!-- -->)?5(?:<!-- -->)? 位可调强度 AI/);
  assert.match(html, /aria-label="雪松队人数"/);
  assert.match(html, /aria-label="红莓队人数"/);
  assert.match(html, /永远攻击最前排/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});
