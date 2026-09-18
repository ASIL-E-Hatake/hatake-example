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
const BASE = argOf("--base", "http://localhost:8081");
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
 * 座標は撮ったものを見て合わせた（当てずっぽうで書くと、違う画面が「その画面」
 * として納品物に残る ── 実際 1回目はメニューが1段ずれて、ダッシュボードの代わりに
 * 帳票が写った）。 */
const AT = {
  userId: [800, 446],
  password: [800, 520],
  signIn: [800, 567],
  menu: {
    受注照会: [79, 84],
    受注入力: [79, 124],
    注文請書: [79, 164],
    // 「管理」はグループの見出しで、押す物ではない（中身は最初から開いている）。
    ダッシュボード: [110, 236],
  },
};

async function signIn(page, who) {
  await page.mouse.click(...AT.userId);
  await page.keyboard.type(who);
  await page.mouse.click(...AT.password);
  // 合言葉は見本なので `<id>123`。
  await page.keyboard.type(`${who}123`);
  await page.mouse.click(...AT.signIn);
  await settle(2500);
}

/** メニューを押して、描き変わるのを待つ。 */
async function openMenu(page, label) {
  await page.mouse.click(...AT.menu[label]);
  await settle(1800);
}

/** 撮る1件。`expect` は**人が見て確かめること**。 */
const CASES = [
  {
    id: "G-01", who: null, file: "G-01-ログイン.png",
    title: "ログイン画面が出る",
    why: "認証は枠組みの外なので、この画面だけ手で書いてある",
    expect: "ID とパスワードの欄・ログインボタンが出ている",
    go: async () => {},
  },
  {
    id: "G-02", who: "tanaka", file: "G-02-受注照会-clerk.png",
    title: "受注照会（営業事務）",
    why: "定義1枚から、検索・一覧・ボタンが全部出る",
    expect: "検索6条件／一覧8列／「CSV 出力」「まとめて取り消す」「詳細」「修正」が出ている。**入力者の列が見えている**",
    go: async () => {},
  },
  {
    id: "G-03", who: "tanaka", file: "G-03-受注入力-手順1.png",
    title: "受注入力（ステップ1: 取引先と納期）",
    why: "`type: wizard` は入力を段階に分ける。新人が迷わないように",
    expect: "ステップが3つ出ていて、1つ目だけが入力できる。取引先は取引先マスタから引いた選択肢",
    go: async (page) => {
      await openMenu(page, "受注入力");
    },
  },
  {
    id: "G-04", who: "tanaka", file: "G-04-注文請書-clerk.png",
    title: "注文請書（帳票）",
    why: "一覧の列がそのまま紙の列になる（画面と紙で列がずれない）",
    expect: "出力条件（受注番号・受注日）と、明細の列が出ている。「CSV 出力」「印刷」が出ている",
    go: async (page) => {
      await openMenu(page, "注文請書");
    },
  },
  {
    id: "G-05", who: "sato", file: "G-05-受注照会-sales.png",
    title: "受注照会（営業）＝見えないものがある",
    why: "定義の `roles` が効いているか。**本当の遮断はサーバ**（A-10 / A-11）",
    expect: "**「まとめて取り消す」「CSV 出力」が消え、入力者の列も無い**。メニューに「注文請書」「管理」が出ない",
    go: async () => {},
  },
  {
    id: "G-06", who: "yamada", file: "G-06-ダッシュボード-manager.png",
    title: "受注ダッシュボード（管理者）",
    why: "管理者だけがメニューから開ける（グループの `roles` が中身にも掛かる）",
    expect: "カードが7枚（件数・金額・平均・取消・取引先別・日別・直近）。ほかの役割ではメニューに出ない",
    go: async (page) => {
      await openMenu(page, "ダッシュボード");
    },
  },
  {
    id: "G-07", who: "yamada", file: "G-07-受注詳細-manager.png",
    title: "受注詳細（読み取り）",
    why: "親子（ヘッダ＋明細）を1枚で読む画面",
    expect: "受注情報・明細のグリッド・金額・履歴の4枠。すべて読み取りで、入力できない",
    go: async (page) => {
      await openMenu(page, "受注照会");
      // 一覧の1行目の「詳細」を押す。
      await page.mouse.click(1447, 344);
      await settle(2500);
    },
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
  // **`null` を初期値にしない。** 「未ログインで撮る」件の `who` も `null` なので、
  // 一致してしまって**ページを開かないまま撮る**（白い紙が1枚できる。実際そうなった）。
  const NOBODY = Symbol("まだ開いていない");
  let signedInAs = NOBODY;

  for (const one of CASES) {
    try {
      if (one.who !== signedInAs) {
        await page.goto(BASE, { waitUntil: "networkidle2" });
        // **描き終わるまで待つ**（固定の秒数で待たない）。
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
      rows.push(`| ${one.id} | ${one.title} | ${one.who ?? "（未ログイン）"} | 撮れた |`);
      bodies.push(
        [
          `### ${one.id} ${one.title}`,
          "",
          `- **役割**: ${one.who ?? "（未ログイン）"}`,
          `- **確かめたいこと**: ${one.why}`,
          `- **目で見て確かめること**: ${one.expect}`,
          "",
          `![${one.id}](画面/${one.file})`,
          "",
        ].join("\n"),
      );
    } catch (error) {
      rows.push(`| ${one.id} | ${one.title} | ${one.who ?? "—"} | **撮れなかった** |`);
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
