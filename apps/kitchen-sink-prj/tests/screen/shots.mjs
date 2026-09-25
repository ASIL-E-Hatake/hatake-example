#!/usr/bin/env node
// 画面を実際に開いて、**項番ごとにスクリーンショット**を撮り、納品用の Markdown に
// まとめる。
//
// ここも**枠組みの外**。hatake は `hatake run` で「その値でどうなるか」を、
// `hatake_test` で「押せるか・出ているか」を確かめられるが、**エビデンスの紙**
// （客先に出すスクショつきの一覧）は持たない。様式が案件ごとに違うので、
// 認証と同じくアプリ側に置く。
//
// 決めごと4つ:
//   ・**スクショは証拠で、判定ではない。** 画面の見た目を機械で合否にすると、
//     余白が1px 動いただけで落ちる紙になる。合否は `hatake run`（値）と
//     API テスト（サーバ）が持ち、ここは**目で確かめるための記録**
//   ・**役割ごとに撮る。** この案件のいちばんの見どころが「誰に何が見えるか」なので
//   ・**撮ったものは消して撮り直す**（前回の残りが混ざると、いつの証拠か分からない）
//   ・**落ちても最後まで回す**（1枚目で止まると残りが撮れない）
//
// 使い方（Docker で回す。手元に Chrome は要らない）:
//   bash tools/run-tests.sh
// 直接:
//   node tests/screen/shots.mjs --base http://localhost:8080

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : fallback;
};
const BASE = argOf("--base", "http://localhost:8083");
const SHOTS = argOf("--shots", "docs/4-テスト/画面");
const OUT = argOf("--out", "docs/4-テスト/出力-画面テスト結果.md");

const settle = (ms = 800) => new Promise((done) => setTimeout(done, ms));

/**
 * 字が出そろうのを待つ。
 *
 * Flutter Web は**アイコンのフォントを後から取りに行く**ので、早く撮ると
 * アイコンが豆腐（□）で写る。納品する紙に豆腐が並ぶと「壊れている」に見える。
 */
const fontsReady = (page) =>
  page.evaluate(() => document.fonts.ready.then(() => undefined)).catch(() => undefined);

/**
 * **真っ白でない**ことを、撮ったもので確かめる。
 *
 * Flutter Web は canvas に描くので、DOM を見ても「描き終わったか」は分からない
 * （要素は先に在って、絵は後から乗る）。固定の秒数で待つと、遅い日に**真っ白な
 * スクリーンショット**が納品物として残る ── 実際そうなった。
 *
 * 一面同じ色の PNG は**ほとんど圧縮されて小さくなる**ので、大きさで見分けられる。
 * 実測（1400x900）: 真っ白 = 5.7KB / いちばん中身の少ないログイン画面 = 18.7KB /
 * 一覧の画面 = 100KB 前後。あいだを取って 10KB を線にする。
 *
 * **測って決めた数**なので、画面の大きさを変えたら測り直すこと（線を上げすぎると
 * 「中身はあるのに白と言う」、下げすぎると白を見逃す）。
 */
const BLANK_LIMIT = 10_000;

/** 描き終わるまで待つ。待ちきれなければ**そう言って落とす**（黙って白を出さない）。 */
async function waitForPaint(page, { tries = 30, every = 1000 } = {}) {
  // まず Flutter の入れ物ができるのを待つ（ここまでは DOM で分かる）。
  await page
    .waitForSelector("flutter-view, flt-glass-pane, flt-scene-host", { timeout: 30_000 })
    .catch(() => undefined);
  await fontsReady(page);

  for (let i = 0; i < tries; i += 1) {
    const shot = await page.screenshot();
    if (shot.length >= BLANK_LIMIT) {
      // 乗りかけの絵を撮らないよう、描き切るのを少しだけ待つ。
      await settle(600);
      return shot.length;
    }
    await settle(every);
  }
  throw new Error(
    `画面が描き終わりません（${tries} 秒待っても真っ白のままでした）。` +
      "docker compose up で web と api が動いているか確かめてください。",
  );
}

/** 画面の中の文字は読めないので、**座標**で押す（1600x900 で撮る前提）。
 *
 * 座標は撮ったものを見て合わせる（当てずっぽうで書くと、違う画面が「その画面」として
 * 納品物に残る ── 2本目で実際にそうなった）。 */
const AT = {
  menu: {
    条件の組み合わせ: [79, 84],
    押す前に聞く: [79, 124],
    選択肢の連動: [79, 164],
    ステップ入力: [79, 204],
    畳み込み: [110, 276],
    帳票: [110, 316],
  },
};

/** 撮る1件。`role` は URL で配る（この案件は認証を持たない）。 */
const CASES = [
  {
    id: "C-01", role: "tester", file: "C-01-条件の組み合わせ.png",
    title: "条件の組み合わせ（all / any / not）と既定値",
    why: "組み合わせ条件はどの例にも書かれていなかった所",
    expect: "種別に「標準」が最初から入っている（defaultValue）。標準なので「標準でないときだけ」の欄は出ていない",
    go: async () => {},
  },
  {
    id: "C-02", role: "tester", file: "C-02-押す前に聞く.png",
    title: "押す前に聞く・区切って実行",
    why: "prompt / batchSize / enabledWhen / open はどの例にも無かった",
    expect: "条件2つと一覧。行の「詳細」は試用の行では押せない。一括のボタンが2つ出ている",
    go: async (page) => { await page.mouse.click(...AT.menu.押す前に聞く); await settle(2000); },
  },
  {
    id: "C-03", role: "tester", file: "C-03-選択肢の連動.png",
    title: "選択肢の連動・ページ送りを切る",
    why: "optionsSource.parentKey / limit / pagination.enabled はどの例にも無かった",
    expect: "ページ送りが出ていない（全部載る）。グループの選択肢は API から来ている",
    go: async (page) => { await page.mouse.click(...AT.menu.選択肢の連動); await settle(2000); },
  },
  {
    id: "C-04", role: "tester", file: "C-04-ステップ入力.png",
    title: "ウィザードのボタン・条件で飛ばすステップ",
    why: "wizardPage.actions はどの例にも無かった",
    expect: "ステップが出ていて、下に「保存」と「やめる」が出ている",
    go: async (page) => { await page.mouse.click(...AT.menu.ステップ入力); await settle(2000); },
  },
  {
    id: "C-05", role: "tester", file: "C-05-畳み込み.png",
    title: "畳み込みの並べ替え・打ち切り・詳細のボタン",
    why: "computed.sort / overflow / detailPage.actions はどの例にも無かった",
    expect: "「金額の大きい順に3件」が**大きい順**に並び、4本以上ある件では「ほか N 件」が付く",
    // **メニューから直接は開かない。** `type: detail` は1件を指すキーが要るので、
    // メニューに置くと鍵が渡らず必ず空になる（1回そうなった）。一覧の「詳細」から開く。
    go: async (page) => {
      await page.mouse.click(...AT.menu.押す前に聞く);
      await settle(2000);
      await page.mouse.click(1016, 289); // 1行目（ITEM-001）の「詳細」
      await settle(2500);
    },
  },
  {
    id: "C-06", role: "admin", file: "C-06-帳票-降順.png",
    title: "帳票の降順・持ち出しは admin だけ",
    why: "report.sort.ascending はどの例にも無かった",
    expect: "コードが**降順**（ITEM-012 が先頭）。「CSV 出力」「印刷」が出ている",
    go: async (page) => { await page.mouse.click(...AT.menu.帳票); await settle(2500); },
  },
  {
    id: "C-07", role: "tester", file: "C-07-帳票-testerには出ない.png",
    title: "帳票（tester）＝持ち出しが出ない",
    why: "roles が効いているか",
    expect: "**「CSV 出力」「印刷」が出ていない**（C-06 との差）",
    go: async (page) => { await page.mouse.click(...AT.menu.帳票); await settle(2500); },
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
  // **`null` を初期値にしない。** 役割が `null` の件と一致してしまって
  // **ページを開かないまま撮る**ことになる（白い紙が1枚できる。1本目で実際そうなった）。
  const NOBODY = Symbol("まだ開いていない");
  let signedInAs = NOBODY;

  for (const one of CASES) {
    try {
      // 役割は URL で配る（この案件は認証を持たない）。役割が変わるときだけ開き直す。
      if (one.role !== signedInAs) {
        await page.goto(`${BASE}/?role=${one.role}`, { waitUntil: "networkidle2" });
        // **描き終わるまで待つ**（固定の秒数で待たない）。
        await waitForPaint(page);
        signedInAs = one.role;
      }
      await one.go(page);
      await fontsReady(page);
      await settle(1200);

      // 撮る直前にもう一度だけ確かめる。描いたあとに**白へ戻る**ことがあるので
      // （service worker の有効化でリロードが走るなど）、白ければ撮り直す。
      let shot;
      for (let i = 0; i < 10; i += 1) {
        shot = await page.screenshot({ path: join(SHOTS, one.file) });
        if (shot.length >= BLANK_LIMIT) break;
        await settle(1000);
      }
      // それでも白いなら**残さずに落とす**（白い紙を納品物にしない）。
      if (shot.length < BLANK_LIMIT) {
        rmSync(join(SHOTS, one.file), { force: true });
        throw new Error(`撮れたものが真っ白でした（${shot.length} バイト）`);
      }
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
          `![${one.id}](画面/${one.file})`,
          "",
        ].join("\n"),
      );
    } catch (error) {
      rows.push(`| ${one.id} | ${one.title} | ${one.role} | **撮れなかった** |`);
      bodies.push(`### ${one.id} ${one.title}\n\n**撮れませんでした**: ${error.message}\n`);
      signedInAs = null;
    }
  }

  await browser.close();

  writeFileSync(
    OUT,
    [
      "# 画面テスト結果（実行記録）",
      "",
      "> **この紙は生成物です。** `tests/screen/shots.mjs` が実際にブラウザで画面を開いて",
      "> 撮っています（手で直さない）。作り直し: `bash tools/run-tests.sh`",
      "",
      "> **スクショは証拠であって、判定ではありません。** 画面の見た目を機械で合否にすると、",
      "> 余白が1px 動いただけで落ちる紙になります。値の合否は `hatake run`（`出力-シナリオ結果.txt`）、",
      "> サーバの合否は API テスト（`出力-APIテスト結果.md`）が持っていて、ここは",
      "> **目で確かめて判子を押すための記録**です。",
      "",
      `- 実行日時: ${new Date().toISOString()}`,
      `- 対象: \`${BASE}\``,
      "- 画面の大きさ: 1400 x 900",
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
