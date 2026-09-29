#!/usr/bin/env node
// 画面（Vue 版）を実際に開いて、項番ごとにスクリーンショットを撮り、納品用の
// Markdown にまとめる。**Flutter 版（shots.mjs）と同じ項番・同じ期待**で撮る。
//
// 同じ定義を別の Renderer で描いているので、**紙を2枚並べれば「描く側が違うだけ」
// が目で確かめられる**。それがこの見本のいちばんの見どころ。
//
// Flutter 版との違いは2つだけ:
//
//   ・**座標で押さない。** ブラウザは DOM なので `data-hatake` で押す。画面を1枚
//     足しても座標がずれない（Flutter 版は canvas なので座標しかない）
//   ・**真っ白かどうかを画像の大きさで測らない。** DOM に要素が在るかで分かる
//
// 使い方（Docker で回す。手元に Chrome は要らない）:
//   bash tools/run-tests.sh
// 直接:
//   node tests/screen/shots-vue.mjs --base http://localhost:8084

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : fallback;
};
const BASE = argOf("--base", "http://localhost:8084");
const SHOTS = argOf("--shots", "docs/4-テスト/画面-vue");
const OUT = argOf("--out", "docs/4-テスト/出力-画面テスト結果-vue.md");

const settle = (ms = 500) => new Promise((done) => setTimeout(done, ms));

/** `data-hatake="…"` で押す。**無ければそう言って落とす**（黙って撮らない）。 */
async function press(page, mark) {
  const found = await page.$(`[data-hatake="${mark}"]`);
  if (found === null) throw new Error(`押すものが見つかりません: ${mark}`);
  await found.click();
  await settle(900);
}

/** その画面が出ているのを待つ。**撮る前に必ず通す。** */
async function waitPage(page, pageId) {
  await page
    .waitForSelector(`[data-hatake="page:${pageId}"]`, { timeout: 10_000 })
    .catch(() => {
      throw new Error(`${pageId} を開いたはずが ${page.url()} でした`);
    });
  await settle(700);
}

/** 撮る1件。`role` は URL で配る（この案件は認証を持たない）。 */
const CASES = [
  {
    id: "V-01", pageId: "combo_form", role: "tester", file: "V-01-条件の組み合わせ.png",
    title: "条件の組み合わせ（all / any / not）と既定値",
    why: "組み合わせ条件が Vue でも同じに効くか",
    expect: "種別に「標準」が最初から入っている（defaultValue）。標準なので「標準でないときだけ」の欄は出ていない",
    go: async () => {},
  },
  {
    id: "V-02", pageId: "press_list", role: "tester", file: "V-02-押す前に聞く.png",
    title: "押す前に聞く・区切って実行・行の有効条件",
    why: "`actions:` が3スコープとも描かれているか（0.9.19 で入った所）",
    expect: "一括が2つ出ていて、**1行も選んでいないので押せない**。行の「詳細」は試用の行だけ灰色。左端に選ぶ列が在る",
    go: async (page) => press(page, "menu:pressList"),
  },
  {
    id: "V-03", pageId: "press_list", role: "tester", file: "V-03-押す前に聞く-選んだ状態.png",
    title: "選んだ件数がボタンに出る",
    why: "「3件のつもりが30件」を押す前に目で見られるか",
    expect: "ボタンが「まとめて単価を変える（12 件）」になり、**maxRows 10 を超えているので押せない**（書庫に入れるは押せる）",
    go: async (page) => {
      await press(page, "menu:pressList");
      await press(page, "select:all");
    },
  },
  {
    id: "V-04", pageId: "press_list", role: "tester", file: "V-04-押す前に聞く-ダイアログ.png",
    title: "押す前に聞く（prompt）",
    why: "`prompt.fields` がダイアログになり、`{count}` が題に埋まるか",
    expect: "「7 件の単価を変える」という題で、単価と理由の2つを聞いている。OK は「変える」",
    go: async (page) => {
      await press(page, "menu:pressList");
      for (const code of ["ITEM-001", "ITEM-003", "ITEM-004", "ITEM-006", "ITEM-007", "ITEM-009", "ITEM-010"]) {
        await press(page, `select:${code}`);
      }
      await press(page, "action:reprice");
      await settle(600);
    },
    // ダイアログは画面の上に出るので、画面の印を待つのではなくダイアログを待つ。
    waitFor: '[data-hatake="ask"]',
  },
  {
    id: "V-05", pageId: "linked_master", role: "tester", file: "V-05-選択肢の連動.png",
    title: "選択肢の連動・ページ送りを切る",
    why: "optionsSource.parentKey / limit / pagination.enabled",
    expect: "ページ送りが出ていない（全部載る）。グループの選択肢は API から来ている",
    go: async (page) => press(page, "menu:linkedMaster"),
  },
  {
    id: "V-06", pageId: "steps_wizard", role: "tester", file: "V-06-ステップ入力.png",
    title: "ウィザードのボタン・条件で飛ばすステップ",
    why: "`wizardPage.actions` が「戻る／次へ」とは別に出るか",
    expect: "ステップが出ていて、上に「保存」「やめる」、下に「戻る」「次へ」",
    go: async (page) => press(page, "menu:stepsWizard"),
  },
  {
    id: "V-07", pageId: "fold_detail", role: "tester", file: "V-07-畳み込み.png",
    title: "畳み込みの並べ替え・打ち切り・明細",
    why: "行のボタンで開けるか、`computed` と `subTable` が描かれるか（両方 0.9.19 で入った）",
    expect: "明細が**表**で出て金額が ¥ 付き。「金額の大きい順に3件」が大きい順、「合計」が明細の和",
    // **メニューからは開かない。** `type: detail` は1件を指す鍵が要るので、一覧の
    // 「詳細」から開く（Flutter 版と同じ理由）。
    go: async (page) => {
      await press(page, "menu:pressList");
      const detail = await page.$('[data-hatake="row:ITEM-001"] [data-hatake="action:openDetail"]');
      if (detail === null) throw new Error("1行目の「詳細」が見つかりません");
      await detail.click();
      await settle(1200);
    },
  },
  {
    id: "V-08", pageId: "sorted_report", role: "admin", file: "V-08-帳票-降順.png",
    title: "帳票の降順・持ち出しは admin だけ",
    why: "report.sort.ascending と、`export` / `print` が口に届くか",
    expect: "コードが**降順**（ITEM-012 が先頭）。「CSV 出力」「印刷」が出ている",
    go: async (page) => {
      await press(page, "menu:sortedReport");
      await press(page, "search:submit");
      await settle(1200);
    },
  },
  {
    id: "V-09", pageId: "sorted_report", role: "tester", file: "V-09-帳票-testerには出ない.png",
    title: "帳票（tester）＝持ち出しが出ない",
    why: "roles が効いているか",
    expect: "**「CSV 出力」「印刷」が出ていない**（V-08 との差）",
    go: async (page) => {
      await press(page, "menu:sortedReport");
      await press(page, "search:submit");
      await settle(1200);
    },
  },
  {
    id: "V-10", pageId: "role_crud", role: "admin", file: "V-10-見せる相手で変わる-admin.png",
    title: "見せる相手で変わる（admin）",
    why: "列・ボタン・項目の roles",
    expect: "「原価」の列が出ている。「CSV 出力」が出ている",
    go: async (page) => press(page, "menu:roleCrud"),
  },
  {
    id: "V-11", pageId: "role_crud", role: "tester", file: "V-11-見せる相手で変わる-tester.png",
    title: "見せる相手で変わる（tester）",
    why: "roles が列とボタンの両方に効いているか",
    expect: "**「原価」の列が無い**。**「CSV 出力」も無い**（V-10 との差）",
    go: async (page) => press(page, "menu:roleCrud"),
  },
  {
    id: "V-12", pageId: "card_board", role: "admin", file: "V-12-カードの盛り合わせ.png",
    title: "カードの盛り合わせ（数・図・表）",
    why: "dashboard のカード3種と span、カードごとの roles・固定条件",
    expect: "件数・原価の合計・G1 だけ・平均原価の4枚と、図と表。admin なので「平均原価」が出ている",
    go: async (page) => press(page, "menu:cardBoard"),
  },
];

const main = async () => {
  rmSync(SHOTS, { recursive: true, force: true });
  mkdirSync(SHOTS, { recursive: true });

  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });

  let taken = 0;
  const rows = [];
  const bodies = [];

  for (const one of CASES) {
    try {
      // **毎回入り直す。** 役割が同じでも、前の件で選んだ行や出した文が残っていると
      // 「その件を撮った」と言えなくなる（Flutter 版は開き直しが重いので役割が
      // 変わったときだけだが、こちらは軽い）。
      await page.goto(`${BASE}/?role=${one.role}`, { waitUntil: "networkidle2" });
      await page.waitForSelector('[data-hatake^="app:"]', { timeout: 20_000 });
      await settle(600);

      await one.go(page);

      if (one.waitFor === undefined) {
        // **どの画面が写るかを、撮る前に確かめる。**
        await waitPage(page, one.pageId);
      } else {
        await page.waitForSelector(one.waitFor, { timeout: 10_000 }).catch(() => {
          throw new Error(`${one.waitFor} が出ませんでした`);
        });
        await settle(500);
      }

      await page.evaluate(() => document.fonts.ready).catch(() => undefined);
      await page.screenshot({ path: join(SHOTS, one.file) });
      taken += 1;
      rows.push(`| ${one.id} | ${one.title} | ${one.role} | 撮れた |`);
      bodies.push(
        [
          `### ${one.id} ${one.title}`,
          "",
          `- **役割**: ${one.role}`,
          `- **確かめたいこと**: ${one.why}`,
          `- **目で見て確かめること**: ${one.expect}`,
          "",
          `![${one.id}](画面-vue/${one.file})`,
          "",
        ].join("\n"),
      );
    } catch (error) {
      rows.push(`| ${one.id} | ${one.title} | ${one.role} | **撮れなかった** |`);
      bodies.push(`### ${one.id} ${one.title}\n\n**撮れませんでした**: ${error.message}\n`);
    }
  }

  await browser.close();

  writeFileSync(
    OUT,
    [
      "# 画面テスト結果（Vue 版・実行記録）",
      "",
      "> **この紙は生成物です。** `tests/screen/shots-vue.mjs` が実際にブラウザで画面を",
      "> 開いて撮っています（手で直さない）。作り直し: `bash tools/run-tests.sh`",
      "",
      "> **Flutter 版の紙（`出力-画面テスト結果.md`）と並べて読んでください。**",
      "> 同じ定義・同じ API を、描く側だけ変えて出しています。項番の中身がそろって",
      "> いれば「Renderer を差し替えても案件は変わらない」が本当だったということです。",
      "",
      "> **スクショは証拠であって、判定ではありません。** 値の合否は `hatake run`、",
      "> サーバの合否は API テストが持っています。",
      "",
      `- 実行日時: ${new Date().toISOString()}`,
      `- 対象: \`${BASE}\``,
      "- 画面の大きさ: 1600 x 900",
      "- 前提: `docker compose up` で初期データの状態",
      "",
      `## まとめ（${taken} / ${CASES.length} 枚）`,
      "",
      "| 項番 | 内容 | 役割 | 撮影 |",
      "|---|---|---|---|",
      ...rows,
      "",
      "---",
      "",
      ...bodies,
    ].join("\n"),
    "utf8",
  );

  console.log(`${taken} / ${CASES.length} 枚撮りました。書きました: ${OUT}`);
  if (taken !== CASES.length) process.exit(1);
};

await main();
