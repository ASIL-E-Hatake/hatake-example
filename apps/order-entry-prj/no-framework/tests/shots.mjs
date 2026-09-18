#!/usr/bin/env node
// フレームワーク無し版の画面を撮る（**同じものが出ているか**を目で確かめるため）。
//
// 隣（hatake 版）の `tests/screen/shots.mjs` とほぼ同じ作り。違うのは座標だけ
// ── 画面を手で組んでいるので、部品の位置が変わる。
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : fallback;
};
const BASE = argOf("--base", "http://localhost:8082");
const SHOTS = argOf("--shots", "画面");
const OUT = argOf("--out", "出力-画面テスト結果.md");
const BLANK_LIMIT = 10_000;

const settle = (ms = 800) => new Promise((done) => setTimeout(done, ms));
const fontsReady = (page) =>
  page.evaluate(() => document.fonts.ready.then(() => undefined)).catch(() => undefined);

async function waitForPaint(page, { tries = 30 } = {}) {
  await page
    .waitForSelector("flutter-view, flt-glass-pane, flt-scene-host", { timeout: 30_000 })
    .catch(() => undefined);
  await fontsReady(page);
  for (let i = 0; i < tries; i += 1) {
    const shot = await page.screenshot();
    if (shot.length >= BLANK_LIMIT) {
      await settle(600);
      return;
    }
    await settle(1000);
  }
  throw new Error("画面が描き終わりません（docker compose -f docker-compose.no-framework.yml up）");
}

const AT = {
  userId: [800, 446],
  password: [800, 520],
  signIn: [800, 567],
  menu: { 受注照会: [110, 96], 受注入力: [110, 144], 注文請書: [110, 192], ダッシュボード: [110, 264] },
};

async function signIn(page, who) {
  await page.mouse.click(...AT.userId);
  await page.keyboard.type(who);
  await page.mouse.click(...AT.password);
  await page.keyboard.type(`${who}123`);
  await page.mouse.click(...AT.signIn);
  await settle(2500);
}

const CASES = [
  { id: "N-01", who: null, file: "N-01-ログイン.png", title: "ログイン画面", go: async () => {} },
  { id: "N-02", who: "tanaka", file: "N-02-受注照会-clerk.png", title: "受注照会（営業事務）", go: async () => {} },
  {
    id: "N-03", who: "tanaka", file: "N-03-受注入力-手順1.png", title: "受注入力（ステップ1）",
    go: async (page) => { await page.mouse.click(...AT.menu.受注入力); await settle(2000); },
  },
  {
    id: "N-04", who: "tanaka", file: "N-04-注文請書-clerk.png", title: "注文請書（帳票）",
    go: async (page) => { await page.mouse.click(...AT.menu.注文請書); await settle(2000); },
  },
  {
    id: "N-05", who: "yamada", file: "N-05-ダッシュボード-manager.png", title: "ダッシュボード（管理者）",
    go: async (page) => { await page.mouse.click(...AT.menu.ダッシュボード); await settle(2500); },
  },
  { id: "N-06", who: "sato", file: "N-06-受注照会-sales.png", title: "受注照会（営業・見えないものがある）", go: async () => {} },
];

const main = async () => {
  rmSync(SHOTS, { recursive: true, force: true });
  mkdirSync(SHOTS, { recursive: true });
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });

  const NOBODY = Symbol("まだ開いていない");
  let signedInAs = NOBODY;
  const rows = [];
  let taken = 0;

  for (const one of CASES) {
    try {
      if (one.who !== signedInAs) {
        await page.goto(BASE, { waitUntil: "networkidle2" });
        await waitForPaint(page);
        if (one.who !== null) {
          await signIn(page, one.who);
          await waitForPaint(page);
        }
        signedInAs = one.who;
      }
      await one.go(page);
      await fontsReady(page);
      await settle(1200);
      let shot;
      for (let i = 0; i < 10; i += 1) {
        shot = await page.screenshot({ path: join(SHOTS, one.file) });
        if (shot.length >= BLANK_LIMIT) break;
        await settle(1000);
      }
      const blank = shot.length < BLANK_LIMIT;
      if (!blank) taken += 1;
      rows.push(`| ${one.id} | ${one.title} | ${blank ? "**真っ白**" : "OK"} | ![](${SHOTS}/${one.file}) |`);
    } catch (e) {
      rows.push(`| ${one.id} | ${one.title} | **NG** ${e.message} | |`);
    }
  }

  writeFileSync(
    OUT,
    [
      "# 画面テスト結果（フレームワーク無し版）",
      "",
      "> **この紙は生成物です。** `tests/shots.mjs` が実際に画面を開いて撮っています。",
      "> 隣（hatake 版）の `docs/4-テスト/出力-画面テスト結果.md` と**同じものが出ているか**を",
      "> 目で見比べるための紙です。",
      "",
      `- 実行日時: ${new Date().toISOString()}`,
      `- 対象: \`${BASE}\``,
      "",
      "| 項番 | 内容 | 結果 | 画面 |",
      "|---|---|---|---|",
      ...rows,
      "",
    ].join("\n"),
    "utf8",
  );
  console.log(`${taken} / ${CASES.length} 枚撮りました。書きました: ${OUT}`);
  await browser.close();
  if (taken !== CASES.length) process.exit(1);
};

await main();
