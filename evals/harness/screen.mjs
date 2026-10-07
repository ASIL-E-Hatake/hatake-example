#!/usr/bin/env node
// 採点（その2）: AI の定義を、30分サンプルの画面の殻に載せて**ブラウザで**確かめる。
// puppeteer の部屋で動く（手元に Chrome は要らない）。
//
//   node screen.mjs --base http://<画面>:80 --task /task/task.json --out /out
//
// 見るのは `data-hatake` の印だけ（枠組みが約束している見つけ方。Renderer の中は読まない）。
// 押してみて結果を見る＝「書いてあるか」ではなく「効くか」。

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer";

const argv = process.argv.slice(2);
const argOf = (name) => argv[argv.indexOf(name) + 1];
const BASE = argOf("--base");
const task = JSON.parse(readFileSync(argOf("--task"), "utf8"));
const OUT = argOf("--out");
const want = task.screen;

const checks = [];
const put = (name, ok, detail = "", asks = "") => checks.push({ part: "画面", name, ok, detail, asks });
const settle = (ms = 500) => new Promise((done) => setTimeout(done, ms));
const rowsOf = async (page) => (await page.$$('[data-hatake^="row:"]')).length;

const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const open = async () => {
  await page.goto(BASE, { waitUntil: "networkidle2" });
  await page.waitForSelector('[data-hatake^="row:"], [data-hatake="boot-error"]', { timeout: 20_000 }).catch(() => undefined);
};

try {
  await open();
  const boot = await page.$eval('[data-hatake="boot-error"]', (one) => one.textContent).catch(() => null);
  put("画面が開く（定義が読める）", boot === null, boot ?? "");
  if (boot !== null) throw new Error("stop");

  const rows = await rowsOf(page);
  put(`開くと ${want.rows} 件並ぶ`, rows === want.rows, `${rows} 件`, "顧客マスタの画面");
  await page.screenshot({ path: join(OUT, "01-一覧.png") });

  const cols = await page.$$eval('[data-hatake^="column:"]', (all) => all.map((one) => one.dataset.hatake.slice(7)));
  const missingCols = want.columns.filter((one) => !cols.includes(one));
  put("一覧に頼んだ項目が出る", missingCols.length === 0, `列: ${cols.join(", ")}`, "項目はコード・顧客名・区分");

  // 選択肢の列が、値（corporate）ではなく言葉（法人）で出るか。
  for (const [field, labels] of Object.entries(want.cellLabels ?? {})) {
    const texts = await page.$$eval(`[data-hatake="cell:${field}"]`, (all) => all.map((one) => one.textContent.trim()));
    const odd = [...new Set(texts.filter((one) => !labels.includes(one)))];
    put(`一覧の ${field} が ${labels.join("／")} で出る`, texts.length > 0 && odd.length === 0, odd.length ? `ほかの字: ${odd.join(", ")}` : "", "区分（法人／個人）");
  }

  for (const one of want.searches) {
    await open();
    const box = await page.$(`[data-hatake="filter:${one.filter}"]`);
    if (box === null) {
      put(one.name, false, `filter:${one.filter} がありません`, one.asks);
      continue;
    }
    if (one.select !== undefined) await page.select(`[data-hatake="filter:${one.filter}"]`, one.select);
    else await box.type(one.type);
    const submit = await page.$('[data-hatake="search:submit"]');
    if (submit !== null) await submit.click();
    await settle(800);
    const got = await rowsOf(page);
    put(one.name, got === one.rows, `${one.select ?? one.type} で ${got} 件（期待 ${one.rows} 件）`, one.asks);
  }

  // 新規登録
  await open();
  const create = await page.$('[data-hatake="action:create"]');
  put("新規登録を押せる", create !== null, "", "登録ができること");
  if (create !== null) {
    await create.click();
    await settle();
    const fields = await page.$$eval('[data-hatake="form"] [data-hatake^="field:"]', (all) => all.map((one) => one.dataset.hatake.slice(6)));
    const missing = want.createFields.filter((one) => !fields.includes(one));
    put("入力欄に頼んだ項目が出る", missing.length === 0, `入力欄: ${[...new Set(fields)].join(", ")}`, "項目はコード・顧客名・区分");
    for (const [field, labels] of Object.entries(want.selectLabels)) {
      const texts = await page
        .$$eval(`[data-hatake="form"] select[data-hatake="field:${field}"] option, [data-hatake="form"] [data-hatake="field:${field}"] label`, (all) =>
          all.map((one) => one.textContent.trim()).filter(Boolean),
        )
        .catch(() => []);
      const lacking = labels.filter((one) => !texts.includes(one));
      put(`${field} を ${labels.join("／")} から選べる`, lacking.length === 0, `選択肢: ${texts.join(", ")}`, "区分（法人／個人）");
    }
    await page.screenshot({ path: join(OUT, "02-新規登録.png") });
  }

  // 修正（キーは変えられない）
  await open();
  const { key, field } = want.readOnlyOnEdit;
  const edit = await page.$(`[data-hatake="edit:${key}"]`);
  put("修正を押せる", edit !== null, "", "修正ができること");
  if (edit !== null) {
    await edit.click();
    await settle();
    const locked = await page
      .$eval(`[data-hatake="form"] [data-hatake="field:${field}"]`, (one) => one.readOnly === true || one.disabled === true)
      .catch(() => null);
    put("修正ではコードを変えられない", locked === true, locked === null ? "入力欄がありません" : locked ? "" : "書き換えられる", "作ったあとは変えられない");
    await page.screenshot({ path: join(OUT, "03-修正.png") });
  }

  // 削除（押すと聞かれる）
  await open();
  const del = await page.$(`[data-hatake="delete:${want.deleteAsks}"]`);
  put("削除を押せる", del !== null, "", "削除ができること");
  if (del !== null) {
    await del.click();
    await settle();
    const ask = await page.$('[data-hatake="ask"]');
    put("削除の前に確認が出る", ask !== null, "", "消すときは確認を出して");
    await page.screenshot({ path: join(OUT, "04-削除の確認.png") });
  }
} catch (error) {
  if (error?.message !== "stop") put("画面を最後まで確かめられた", false, String(error?.message ?? error).slice(0, 300));
} finally {
  await browser.close();
}

writeFileSync(join(OUT, "screen.json"), JSON.stringify({ checks }, null, 2));
