#!/usr/bin/env node
// 案件の定義を VS Code 拡張で開いたところを撮る（tools/vscode-shots.sh から呼ぶ）。
//
//   node vscode-shots.mjs <code-server の URL> <案件のフォルダ> <画像の置き場> <版>
//
// 何を撮るかは案件の `tools/vscode-shots.json`。撮るだけでなく、**撮れた中身を案件の紙と
// 突き合わせる**:
//   ・「人が決めること」に並ぶ問い ＝ docs/2-設計/出力-残っている問い.txt の問い
//   ・確認のタブの「答え済み」の数 ＝ 同じ紙の「前書きで答えが済んでいるもの N件」
//   ・狭い役割のメニューには出ず、広い役割には出るもの（設定の roles）
// 拡張機能と道具の紙が食い違ったら落ちる（0.9.31 は前書きを読まず、ここが 1 件と 8 件で
// 食い違っていた）。

import { readFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer";

const [BASE, PRJ, OUT, VERSION] = process.argv.slice(2);
const config = JSON.parse(readFileSync(join(PRJ, "tools", "vscode-shots.json"), "utf8"));
const paper = readFileSync(join(PRJ, "docs", "2-設計", "出力-残っている問い.txt"), "utf8");
const asked = [...paper.matchAll(/^\d+\. \[([\w-]+)\] (.+)$/gm)].map((m) => ({ id: m[1], ask: m[2] }));
const answered = Number(paper.match(/前書きで答えが済んでいるもの (\d+)件/)?.[1] ?? "0");

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? "OK  " : "NG  "} ${what}`);
  if (!ok) failures.push(what);
};

const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 860 });

async function open() {
  for (let i = 0; i < 60; i++) {
    try {
      await page.goto(`${BASE}/?folder=/home/coder/project`, { waitUntil: "networkidle2", timeout: 15_000 });
      await page.waitForSelector(".monaco-workbench", { timeout: 15_000 });
      await sleep(4000);
      return;
    } catch {
      await sleep(3000);
    }
  }
  throw new Error("code-server が立ち上がりませんでした。");
}

/**
 * 左の欄の行を字で探して押す（見えている行しか作られないので、転がして探す）。
 * `folder` なら開閉できる行だけ（メニューの「受注照会」と画面の「受注照会」は同じ字）。
 */
async function tree(match, { folder = false } = {}) {
  const hit = typeof match === "string" ? (text) => text === match : match;
  for (let i = 0; i < 30; i++) {
    if (i > 0) {
      await page.mouse.move(200, 260);
      await page.mouse.wheel({ deltaY: i < 15 ? 220 : -220 });
      await sleep(300);
    }
    for (const row of await page.$$(".sidebar .monaco-list-row")) {
      const text = await row.evaluate((el) => el.querySelector(".label-name, .monaco-highlighted-label")?.textContent ?? "");
      const opens = (await row.evaluate((el) => el.getAttribute("aria-expanded"))) !== null;
      if (hit(text.trim()) && (!folder || opens)) {
        await row.click();
        await sleep(1500);
        if ((await row.evaluate((el) => el.getAttribute("aria-expanded"))) === "false") {
          await (await row.$(".monaco-tl-twistie"))?.click();
          await sleep(800);
        }
        return true;
      }
    }
    await sleep(500);
  }
  return false;
}

/** Webview の中（入れ子の iframe）を、目印の要素で探す。 */
async function frameWith(selector) {
  for (let i = 0; i < 20; i++) {
    for (const frame of page.frames()) {
      if ((await frame.$(selector).catch(() => null)) !== null) return frame;
    }
    await sleep(500);
  }
  return null;
}

const shot = async (name) => {
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`撮りました: ${name}.png`);
};

/** 画面のタブの役割を切り替えて、描かれた字を返す。 */
async function asRole(view, role) {
  await view.select('[data-hatake="preview-role"]', role);
  await sleep(1500);
  return view.$eval("#app", (el) => el.textContent ?? "");
}

try {
  await open();
  await page.click('.activitybar [aria-label^="hatake"]');
  await sleep(2500);

  // 1. app の根を選ぶ → app ぜんぶ（メニューつき）
  check(await tree(config.app), `ツリーに「${config.app}」が並び、選べる`);
  let view = await frameWith('[data-hatake="preview-role"]');
  check(view !== null, "画面のタブが開く");
  await shot("01-ツリーと画面");

  // 2・3. 役割で見え方が変わる（狭い役割には出ないものが、広い役割には出る）
  const narrow = view === null ? "" : await asRole(view, config.roles.narrow);
  check(config.roles.onlyWide.every((one) => !narrow.includes(one)), `${config.roles.narrow} のメニューに ${config.roles.onlyWide.join("・")} が出ない`);
  await shot(`02-役割-${config.roles.narrow}`);
  const wide = view === null ? "" : await asRole(view, config.roles.wide);
  check(config.roles.onlyWide.every((one) => wide.includes(one)), `${config.roles.wide} のメニューには ${config.roles.onlyWide.join("・")} が出る`);
  await shot(`03-役割-${config.roles.wide}`);

  // 4. 1画面の権限のタブ（見えない列が、その役割で「－」）
  check(await tree(config.page, { folder: true }), `画面「${config.page}」を選べる`);
  view = await frameWith('[data-hatake="view-tab:roles"]');
  if (view !== null) {
    await view.click('[data-hatake="view-tab:roles"]');
    await sleep(800);
  }
  const matrix = view === null ? null : await view.evaluate((hidden) => {
    const table = document.querySelector(".hatake-view-matrix");
    if (table === null) return null;
    const head = [...table.querySelectorAll("tr:first-child th")].map((th) => th.textContent);
    const row = [...table.querySelectorAll("tr")].find((tr) => tr.children[1]?.textContent === hidden.label);
    return row === undefined ? null : row.children[head.indexOf(hidden.role)]?.textContent ?? null;
  }, config.hidden);
  check(matrix === "－", `権限のタブで「${config.hidden.label}」は ${config.hidden.role} に見えない（${matrix ?? "行が無い"}）`);
  await shot("04-権限のタブ");

  // 5. 操作を選ぶ → 操作のタブで光る
  await tree((text) => text.startsWith("操作（"), { folder: true });
  check(await tree(config.action.label), `操作「${config.action.label}」を選べる`);
  view = await frameWith('[data-hatake="view-tabs"]');
  check(view !== null && (await view.$(`[data-hatake="view-row:action:${config.action.key}"].hatake-view-hit`)) !== null, "操作のタブで、選んだ行が光る");
  await shot("05-操作のタブ");

  // 6. 人が決めること ＝ 道具の紙（出力-残っている問い.txt）と同じ問い
  const rows = await page.$$eval(".sidebar .monaco-list-row", (all) =>
    all.filter((row) => row.querySelector(".codicon-question") !== null).map((row) => row.querySelector(".label-name, .monaco-highlighted-label")?.textContent?.trim() ?? ""),
  );
  const inTree = [...new Set(rows)].sort();
  const inPaper = [...new Set(asked.map((one) => one.ask))].sort();
  check(JSON.stringify(inTree) === JSON.stringify(inPaper), `人が決めること（${inTree.length} 件）＝ 出力-残っている問い.txt（${inPaper.length} 件: ${asked.map((one) => one.id).join(", ")}）`);
  for (const row of await page.$$(".sidebar .monaco-list-row")) {
    if ((await row.$(".codicon-question")) !== null) {
      await row.click();
      await sleep(1500);
      break;
    }
  }
  view = await frameWith('[data-hatake="view-project"]');
  const projectLine = view === null ? "" : await view.$eval('[data-hatake="view-project"]', (el) => el.textContent ?? "");
  check(projectLine.includes(`答え済みの問い ${answered} 件`), `確認のタブの答え済み ＝ 前書きで答えが済んでいるもの ${answered} 件（${projectLine.slice(0, 70)}）`);
  for (const one of asked) {
    check(view !== null && (await view.$(`[data-hatake="view-note:question:${one.id}"]`)) !== null, `確認のタブに ${one.id} が出る`);
  }
  await shot("06-人が決めること");

  const bar = await page.$$eval(".statusbar-item", (all) => all.map((one) => one.textContent ?? ""));
  check(bar.some((one) => one.includes(`hatake ${VERSION}`)), `状態バーの版が ${VERSION}（${bar.find((one) => one.includes("hatake")) ?? "出ない"}）`);
} catch (error) {
  await page.screenshot({ path: join(OUT, "_failed.png") }).catch(() => undefined);
  failures.push(String(error?.message ?? error));
  console.error(error);
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.log(`\n${failures.length} 件が期待と違います（_failed.png を見てください）。`);
  process.exit(1);
}
console.log("\nすべて撮れました。");
