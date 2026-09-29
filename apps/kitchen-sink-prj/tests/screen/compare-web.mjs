#!/usr/bin/env node
// **2つの Renderer が同じものを出しているか**を、実際に開いて突き合わせる。
//
// スクリーンショットは証拠だが、比べる相手としては弱い（余白が1px 動いただけで
// 「違う」になるし、逆に中身が違っても見た目が似ていれば気づけない）。ここで比べるのは
// **印（`data-hatake`）と字**——どちらも契約なので、揃っていなければ案件の CSS も
// 画面の試験も、載せ替えた瞬間に壊れる。
//
// 使い方:
//   node tests/screen/compare-web.mjs --a http://localhost:8084 --b http://localhost:8085
//
// 落ちたら**どちらかの Renderer が欠けている**（か、片方だけ直した）。

import { writeFileSync } from "node:fs";
import puppeteer from "puppeteer";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : fallback;
};
const A = { name: argOf("--a-name", "Vue"), base: argOf("--a", "http://localhost:8084") };
const B = { name: argOf("--b-name", "React"), base: argOf("--b", "http://localhost:8085") };
const OUT = argOf("--out", "docs/4-テスト/出力-Renderer比較.md");

const settle = (ms = 700) => new Promise((done) => setTimeout(done, ms));

/** 見る画面と、そこへの行き方（`detail` は鍵が要るので道で開く）。 */
const PAGES = [
  { id: "combo_form", role: "tester", path: "/combo_form" },
  { id: "press_list", role: "tester", path: "/press_list" },
  { id: "linked_master", role: "tester", path: "/linked_master" },
  { id: "steps_wizard", role: "tester", path: "/steps_wizard" },
  { id: "role_crud", role: "admin", path: "/role_crud" },
  { id: "role_crud", role: "tester", path: "/role_crud" },
  { id: "card_board", role: "admin", path: "/card_board" },
  { id: "fold_detail", role: "tester", path: "/fold_detail?itemCode=ITEM-001" },
  // 帳票は**押すまで紙が出ない**ので、押してから見る。
  { id: "sorted_report", role: "admin", path: "/sorted_report", press: "search:submit" },
  { id: "sorted_report", role: "tester", path: "/sorted_report", press: "search:submit" },
];

/** その画面が出しているもの（印と字）。**比べる相手はこれだけ。** */
async function look(page, where, one) {
  const url = `${where.base}${one.path}${one.path.includes("?") ? "&" : "?"}role=${one.role}`;
  await page.goto(url, { waitUntil: "networkidle2" });
  await page.waitForSelector(`[data-hatake="page:${one.id}"]`, { timeout: 15_000 });
  await settle();
  if (one.press !== undefined) {
    await page.click(`[data-hatake="${one.press}"]`);
    await settle(1500);
  }
  return page.evaluate(() => ({
    marks: [...new Set([...document.querySelectorAll("[data-hatake]")].map((e) => e.getAttribute("data-hatake")))].sort(),
    classes: [...new Set([...document.querySelectorAll("[class]")].flatMap((e) => [...e.classList]))]
      .filter((one) => one.startsWith("hatake-"))
      .sort(),
    // 字は**詰めて**比べる（改行やタブの入り方は描く側の都合）。
    text: (document.querySelector("main")?.innerText ?? "").replace(/\s+/g, " ").trim(),
  }));
}

const only = (a, b) => a.filter((one) => !b.includes(one));

const main = async () => {
  const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });

  let bad = 0;
  const rows = [];
  const details = [];

  for (const one of PAGES) {
    const label = `${one.id}（${one.role}）`;
    try {
      const a = await look(page, A, one);
      const b = await look(page, B, one);

      const problems = [];
      const markGap = [...only(a.marks, b.marks).map((x) => `${A.name} だけ: ${x}`),
                       ...only(b.marks, a.marks).map((x) => `${B.name} だけ: ${x}`)];
      const classGap = [...only(a.classes, b.classes).map((x) => `${A.name} だけ: ${x}`),
                        ...only(b.classes, a.classes).map((x) => `${B.name} だけ: ${x}`)];
      if (markGap.length > 0) problems.push(`印: ${markGap.join(" / ")}`);
      if (classGap.length > 0) problems.push(`クラス名: ${classGap.join(" / ")}`);
      if (a.text !== b.text) {
        // どこから違うかを言う（全文を並べても読めない）。
        let at = 0;
        while (at < a.text.length && at < b.text.length && a.text[at] === b.text[at]) at += 1;
        problems.push(
          `字: ${at} 文字目から違う\n\n` +
            `  ${A.name}: …${a.text.slice(Math.max(0, at - 30), at + 60)}\n` +
            `  ${B.name}: …${b.text.slice(Math.max(0, at - 30), at + 60)}`,
        );
      }

      if (problems.length === 0) {
        rows.push(`| ${label} | ${a.marks.length} | ${a.classes.length} | ${a.text.length} | 揃っている |`);
      } else {
        bad += 1;
        rows.push(`| ${label} | ${a.marks.length} | ${a.classes.length} | ${a.text.length} | **違う** |`);
        details.push(`### ${label}\n\n${problems.map((one) => `- ${one}`).join("\n")}\n`);
      }
    } catch (error) {
      bad += 1;
      rows.push(`| ${label} | — | — | — | **見られなかった** |`);
      details.push(`### ${label}\n\n**見られませんでした**: ${error.message}\n`);
    }
  }

  await browser.close();

  writeFileSync(
    OUT,
    [
      "# Renderer の突き合わせ（実行記録）",
      "",
      "> **この紙は生成物です。** `tests/screen/compare-web.mjs` が2つの画面を実際に開いて",
      "> 突き合わせています（手で直さない）。",
      "",
      `> 比べているのは**印（\`data-hatake\`）・クラス名・字**の3つです。`,
      "> スクリーンショットは証拠ですが、比べる相手としては弱い（余白が1px 動いただけで",
      "> 「違う」になるし、中身が違っても見た目が似ていれば気づけない）。この3つは",
      "> **契約**なので、揃っていなければ載せ替えた案件が黙って壊れます。",
      "",
      `- 実行日時: ${new Date().toISOString()}`,
      `- ${A.name}: \`${A.base}\``,
      `- ${B.name}: \`${B.base}\``,
      "",
      `## まとめ（${PAGES.length - bad} / ${PAGES.length} 画面が揃っている）`,
      "",
      "| 画面（役割） | 印 | クラス名 | 字数 | 突き合わせ |",
      "|---|---|---|---|---|",
      ...rows,
      "",
      ...(details.length === 0
        ? ["**どの画面も、印もクラス名も字も一致しました。**", ""]
        : ["---", "", ...details]),
    ].join("\n"),
    "utf8",
  );

  console.log(`${PAGES.length - bad} / ${PAGES.length} 画面が揃っています。書きました: ${OUT}`);
  if (bad > 0) process.exit(1);
};

await main();
