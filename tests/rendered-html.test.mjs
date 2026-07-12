import assert from "node:assert/strict";
import test from "node:test";

async function render(acceptLanguage, cookie) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: {
        accept: "text/html",
        "accept-language": acceptLanguage,
        ...(cookie ? { cookie } : {}),
      },
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

test("server-renders the Chinese snow fighting game for a Chinese browser", async () => {
  const response = await render("zh-CN,zh;q=0.9,en;q=0.8");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>河岸雪仗/);
  assert.match(html, /SNOWCRAFT-INSPIRED TACTICAL REMAKE/);
  assert.match(html, /全英文单词竞速/);
  assert.match(html, /好友联机/);
  assert.match(html, /按阵型开战/);
  assert.match(html, /3(?:<!-- -->)? VS (?:<!-- -->)?3/);
  assert.match(html, /1 位真人 \+ (?:<!-- -->)?5(?:<!-- -->)? 位可调强度 AI/);
  assert.match(html, /移除 AI/);
  assert.match(html, /<option value="steady" selected="">熟练 AI<\/option>/);
  assert.match(html, /aria-label="雪松队人数"/);
  assert.match(html, /aria-label="红莓队人数"/);
  assert.match(html, /aria-label="选择单词册"/);
  assert.match(html, /大学四级 · 大型词库/);
  assert.match(html, /大学六级 · 大型词库/);
  assert.match(html, /考研英语 · 大型词库/);
  assert.match(html, /3853 词/);
  assert.match(html, /5412 词/);
  assert.match(html, /4851 词/);
  assert.match(html, /经典情景英语 · 入门/);
  assert.match(html, /aria-label="选择雪花密度"/);
  assert.match(html, /普通伤害 10 \/ 11 \/ 12 \/ 13 · 最长 10 词轮换超级雪花 · 全体命中 15 \+ 冻住 1 秒/);
  assert.doesNotMatch(html, /冰锥|冰晶/);
  assert.match(html, /英文雪花落地 2 秒后融化/);
  assert.doesNotMatch(html, /英文雪花直到被抢才消失/);
  assert.match(html, /新雪球锁定当前前排/);
  assert.match(html, /全员 100 HP/);
  assert.doesNotMatch(html, /肉盾|快手|职业与速度/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("server-renders the complete English lobby for a non-Chinese browser", async () => {
  const response = await render("en-US,en;q=0.9");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<html lang="en"/);
  assert.match(html, /<title>Riverbank Snow Battle/);
  assert.match(html, /Race to type English words/);
  assert.match(html, /Online with Friends/);
  assert.match(html, /Remove AI/);
  assert.match(html, /<option value="steady" selected="">Skilled AI<\/option>/);
  assert.match(html, /Start with This Formation/);
  assert.match(html, /Pine team size/);
  assert.match(html, /CET-4 · Large Wordbook/);
  assert.match(html, /CET-6 · Large Wordbook/);
  assert.match(html, /Postgraduate English · Large Wordbook/);
  assert.match(html, /3853 words/);
  assert.match(html, /5412 words/);
  assert.match(html, /4851 words/);
  assert.match(html, /The 10 longest words rotate as Super Snowflakes · Hit all opponents for 15 \+ freeze for 1 second/);
  assert.doesNotMatch(html, /giant frost snowflake|frost words/i);
  assert.match(html, /Words melt 2 seconds after landing/);
  assert.doesNotMatch(html, /Words remain until claimed/);
  assert.match(html, /Everyone has 100 HP/);
  assert.match(html, /语言 \/ Language/);
});

test("the language cookie overrides the browser language", async () => {
  const response = await render("zh-CN", "snow_battle_language=en");
  const html = await response.text();
  assert.match(html, /<html lang="en"/);
  assert.match(html, /Set your formation/);
});
