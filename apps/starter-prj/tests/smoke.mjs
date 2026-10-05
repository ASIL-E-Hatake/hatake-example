#!/usr/bin/env node
// 30分サンプルが**本当に動くか**を、ブラウザで開いて確かめる（README の絵もここで撮る）。
//
// 見るのは README の手順そのもの:
//   1. 開くと顧客が並ぶ
//   2. 新規登録を押すと入力欄が出る
//   3. 定義に列を1つ足して再読み込みすると、画面に出る（作り直しは要らない）
//   4. 定義を書き間違えると、画面に理由が出る（白い画面にならない）
//
// 使い方（Docker で回す。手元に Chrome は要らない）:
//   docker compose up -d
//   docker run --rm --network starter-prj_default -v "$PWD:/prj" ghcr.io/puppeteer/puppeteer:latest \
//     sh -c "cp /prj/tests/smoke.mjs . && node smoke.mjs --base http://web:80 --shots /prj/docs/画面"

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : fallback;
};
const BASE = argOf("--base", "http://localhost:8090");
const SHOTS = argOf("--shots", "docs/画面");
/** 書き間違いを試すときに書き換える定義（手元のフォルダ。nginx がそのまま配っている）。 */
const DEFINITION = argOf("--definition", "");

const settle = (ms = 600) => new Promise((done) => setTimeout(done, ms));
const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? "OK  " : "NG  "} ${what}`);
  if (!ok) failures.push(what);
};

mkdirSync(SHOTS, { recursive: true });
const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });

try {
  // 1. 開くと顧客が並ぶ
  await page.goto(BASE, { waitUntil: "networkidle2" });
  await page.waitForSelector('[data-hatake^="row:"]', { timeout: 20_000 }).catch(() => undefined);
  const rows = await page.$$('[data-hatake^="row:"]');
  check(rows.length === 10, `開くと顧客が10件並ぶ（${rows.length} 件）`);
  await page.screenshot({ path: join(SHOTS, "01-顧客マスタ.png") });

  // 2. 新規登録を押すと入力欄が出る
  const create = await page.$('[data-hatake="action:create"]');
  check(create !== null, "「新規登録」が出ている");
  if (create !== null) {
    await create.click();
    await settle();
    check((await page.$('[data-hatake="form"]')) !== null, "押すと入力欄が出る");
    await page.screenshot({ path: join(SHOTS, "02-新規登録.png") });
  }

  // 3〜4 は定義を書き換える（置き場を渡されたときだけ。終わったら必ず元に戻す）。
  if (DEFINITION !== "") {
    const original = readFileSync(DEFINITION, "utf8");
    try {
      // 3. README の「列と入力欄を足す」をそのまま当てて、再読み込みすると画面に出る
      const column = "          - { field: kind, label: 区分, type: badge, width: 90, optionsOf: customerKind }\n";
      const field = "              - { field: kind, label: 区分, type: select, required: true, optionsOf: customerKind }\n";
      if (!original.includes(column) || !original.includes(field)) {
        throw new Error("定義の形が README の手順と合いません（列か入力欄の行が見つからない）");
      }
      writeFileSync(
        DEFINITION,
        original
          .replace(column, `${column}          - { field: phone, label: 電話番号, width: 140 }\n`)
          .replace(
            field,
            `${field}              - field: phone\n` +
              "                label: 電話番号\n" +
              "                type: text\n" +
              "                validators:\n" +
              '                  - { type: pattern, pattern: "^[0-9-]+$", message: 数字とハイフンで入れてください }\n',
          ),
      );
      await page.goto(BASE, { waitUntil: "networkidle2" });
      await page.waitForSelector('[data-hatake^="row:"]', { timeout: 10_000 }).catch(() => undefined);
      const text = await page.evaluate(() => document.body.innerText);
      check(text.includes("電話番号"), "列を足して再読み込みすると、一覧に出る");
      await page.screenshot({ path: join(SHOTS, "03-列を足した.png") });

      await page.click('[data-hatake="action:create"]');
      await settle();
      const phone = await page.$('[data-hatake="field:phone"] input, input[data-hatake="field:phone"]');
      check(phone !== null, "入力欄にも電話番号が出る");
      if (phone !== null) {
        await phone.type("abc");
        await page.$eval('[data-hatake="form"]', (form) => form.requestSubmit());
        await settle();
        const after = await page.evaluate(() => document.body.innerText);
        check(after.includes("数字とハイフンで入れてください"), "字を入れて保存すると、書いた文で止まる");
      }

      // 4. 書き間違えると、画面に理由が出る
      writeFileSync(DEFINITION, original.replace("required: true", "requird: true"));
      await page.goto(BASE, { waitUntil: "networkidle2" });
      await page.waitForSelector('[data-hatake="boot-error"]', { timeout: 10_000 }).catch(() => undefined);
      const said = await page.$eval('[data-hatake="boot-error"]', (one) => one.textContent).catch(() => "");
      check(said.includes("requird"), `書き間違えると理由が出る（${said.slice(0, 60)}…）`);
      await page.screenshot({ path: join(SHOTS, "04-書き間違い.png") });
    } finally {
      writeFileSync(DEFINITION, original);
    }
  }
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.log(`\n${failures.length} 件が期待と違います。`);
  process.exit(1);
}
console.log("\nすべて期待どおり。");
